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
} from '../criptografia/der';
import type { Firmador } from '../criptografia/firmador';
import { OID } from '../criptografia/oids';

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
