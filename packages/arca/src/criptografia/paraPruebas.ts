// Solo para tests: usa node:crypto, que no existe en la app.
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  cadenaBits,
  conjunto,
  contexto,
  entero,
  imprimible,
  nulo,
  oid,
  secuencia,
  tlv,
  utcTime,
  utf8,
} from './der';
import type { AlmacenDeClaves } from '../certificados/pedidoDeCertificado';
import type { Firmador } from './firmador';
import { OID } from './oids';

export function crearFirmadorDePrueba() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const firmador: Firmador = {
    clavePublica: () =>
      Promise.resolve(new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }))),
    firmar: (datos) => Promise.resolve(new Uint8Array(sign('sha256', datos, privateKey))),
  };

  return { firmador, publicKey };
}

export interface OpcionesDeCertificado {
  /** CN de quien lo emite. ARCA usa "Computadores Test" en homologación y "Computadores" en producción. */
  readonly emisor?: string;
  readonly cuit?: string;
  readonly desde?: Date;
  readonly hasta?: Date;
  /** Fechas en GeneralizedTime en lugar de UTCTime, como en los certificados que vencen desde 2050. */
  readonly fechasGeneralizadas?: boolean;
}

/** Certificado como el que ARCA emite a partir del CSR, firmado con la clave del propio firmador. */
export async function crearCertificadoDePrueba(
  firmador: Firmador,
  opciones: OpcionesDeCertificado = {},
): Promise<Uint8Array> {
  const {
    emisor = 'Computadores Test',
    cuit = '20123456786',
    desde = new Date('2026-01-01T00:00:00Z'),
    hasta = new Date('2027-01-01T00:00:00Z'),
    fechasGeneralizadas = false,
  } = opciones;
  const fecha = fechasGeneralizadas ? generalizedTime : utcTime;
  const algoritmo = secuencia(oid(OID.sha256ConRsa), nulo());
  const atributo = (tipo: string, valor: Uint8Array) => conjunto(secuencia(oid(tipo), valor));

  const tbs = secuencia(
    contexto(0, entero(2)),
    entero(Uint8Array.of(0x8a, 0x01, 0x02)),
    algoritmo,
    secuencia(
      atributo(OID.nombreComun, utf8(emisor)),
      atributo(OID.organizacion, utf8('AFIP')),
      atributo(OID.pais, imprimible('AR')),
    ),
    secuencia(fecha(desde), fecha(hasta)),
    secuencia(
      atributo(OID.nombreComun, utf8('facturadorfacil')),
      atributo(OID.numeroDeSerie, imprimible(`CUIT ${cuit}`)),
    ),
    await firmador.clavePublica(),
  );

  return secuencia(tbs, algoritmo, cadenaBits(await firmador.firmar(tbs)));
}

function generalizedTime(fecha: Date): Uint8Array {
  const texto = fecha.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
  return tlv(0x18, new TextEncoder().encode(texto));
}

/** Almacén de claves en memoria con claves RSA reales, como el del dispositivo. */
export function crearAlmacenDeClavesDePrueba() {
  const claves = new Map<string, ReturnType<typeof crearFirmadorDePrueba>>();
  const generadas: string[] = [];

  const almacen: AlmacenDeClaves = {
    existeClave: (alias) => claves.has(alias),
    generarClave: (alias) => {
      if (claves.has(alias)) return Promise.reject(new Error('CLAVE_EXISTENTE'));
      generadas.push(alias);
      claves.set(alias, crearFirmadorDePrueba());
      return Promise.resolve();
    },
    clavePublica: (alias) => conClave(alias, (firmador) => firmador.clavePublica()),
    firmar: (alias, datos) => conClave(alias, (firmador) => firmador.firmar(datos)),
  };

  /** Como el módulo nativo, usar un alias sin clave rechaza la promesa. */
  const conClave = (alias: string, usar: (firmador: Firmador) => Promise<Uint8Array>) => {
    const encontrada = claves.get(alias);
    return encontrada ? usar(encontrada.firmador) : Promise.reject(new Error('SIN_CLAVE'));
  };

  return { almacen, generadas, clave: (alias: string) => claves.get(alias) };
}
