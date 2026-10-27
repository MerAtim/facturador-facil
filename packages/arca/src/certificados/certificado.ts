import type { Ambiente } from '@facturador/aplicacion';
import { exito, fallo, type Resultado } from '@facturador/dominio';

import { desdePem } from '../criptografia/codificacion';
import { hijos, leer, oid, type Elemento } from '../criptografia/der';
import { OID } from '../criptografia/oids';
import { aliasDeClave, type AlmacenDeClaves, type Titular } from './pedidoDeCertificado';

/** Un certificado ocupa poco más de 1 KB. Cualquier cosa mucho más grande no es lo que se espera. */
export const TAMANIO_MAXIMO_DEL_CERTIFICADO = 16 * 1024;

/** Nombre común de la autoridad de ARCA que firma los certificados de cada ambiente. */
const EMISOR_DE_ARCA: Readonly<Record<Ambiente, string>> = {
  homologacion: 'Computadores Test',
  produccion: 'Computadores',
};

export interface DatosDelCertificado {
  /** Nombre común de quien lo emitió. */
  readonly emisor: string | undefined;
  /** El CUIT del sujeto, del atributo serialNumber "CUIT 20123456786". */
  readonly cuit: string | undefined;
  readonly vigenteDesde: Date;
  readonly vigenteHasta: Date;
  /** SubjectPublicKeyInfo en DER. */
  readonly clavePublica: Uint8Array;
}

export type MotivoCertificadoInvalido =
  | 'archivo_demasiado_grande'
  | 'no_es_un_certificado'
  | 'emisor_desconocido'
  | 'es_de_otro_ambiente'
  | 'cuit_distinto'
  | 'no_corresponde_a_la_clave'
  | 'todavia_no_vigente'
  | 'vencido';

export interface CertificadoInvalido {
  readonly tipo: 'certificado_invalido';
  readonly motivo: MotivoCertificadoInvalido;
}

export interface CertificadoValido {
  /** El certificado en DER, listo para firmar los pedidos a WSAA. */
  readonly der: Uint8Array;
  readonly vigenteHasta: Date;
}

/**
 * Valida el archivo que el usuario eligió como certificado de ARCA. Se mira el contenido, no la
 * extensión: se acepta PEM o DER.
 *
 * La comprobación fuerte es que la clave pública sea la que generó este dispositivo. No se verifica
 * la firma de la autoridad de ARCA: WSAA rechaza cualquier certificado que ARCA no haya emitido, y
 * lo que se revisa acá alcanza para detectar un archivo equivocado antes de usarlo.
 */
export async function validarCertificado(
  archivo: Uint8Array,
  titular: Titular,
  claves: AlmacenDeClaves,
  ahora: Date,
): Promise<Resultado<CertificadoValido, CertificadoInvalido>> {
  if (archivo.length > TAMANIO_MAXIMO_DEL_CERTIFICADO) return invalido('archivo_demasiado_grande');

  const der = derDelArchivo(archivo);
  const datos = der && leerCertificado(der);
  if (!der || !datos) return invalido('no_es_un_certificado');

  const otroAmbiente = titular.ambiente === 'homologacion' ? 'produccion' : 'homologacion';
  if (datos.emisor === EMISOR_DE_ARCA[otroAmbiente]) return invalido('es_de_otro_ambiente');
  if (datos.emisor !== EMISOR_DE_ARCA[titular.ambiente]) return invalido('emisor_desconocido');
  if (datos.cuit !== titular.cuit.valor) return invalido('cuit_distinto');

  const alias = aliasDeClave(titular);
  const propia = claves.existeClave(alias) ? await claves.clavePublica(alias) : undefined;
  if (!propia || !mismosBytes(propia, datos.clavePublica)) {
    return invalido('no_corresponde_a_la_clave');
  }

  if (ahora < datos.vigenteDesde) return invalido('todavia_no_vigente');
  if (ahora > datos.vigenteHasta) return invalido('vencido');

  return exito({ der, vigenteHasta: datos.vigenteHasta });
}

/** Los datos de un certificado X.509 en DER, o undefined si no se puede leer como tal. */
export function leerCertificado(der: Uint8Array): DatosDelCertificado | undefined {
  try {
    const certificado = leer(der);
    if (certificado.etiqueta !== 0x30 || certificado.bytes.length !== der.length) return undefined;

    const [tbs] = hijos(certificado);
    if (!tbs) return undefined;
    const campos = hijos(tbs);
    // La versión es opcional y va etiquetada [0].
    const desdeElNumeroDeSerie = campos[0]?.etiqueta === 0xa0 ? campos.slice(1) : campos;
    const [, , emisor, validez, sujeto, clavePublica] = desdeElNumeroDeSerie;
    if (!emisor || !validez || !sujeto || !clavePublica) return undefined;

    const [desde, hasta] = hijos(validez).map(leerFecha);
    if (!desde || !hasta) return undefined;

    const serie = atributo(sujeto, OID.numeroDeSerie);
    return {
      emisor: atributo(emisor, OID.nombreComun),
      cuit: /^CUIT (\d{11})$/.exec(serie ?? '')?.[1],
      vigenteDesde: desde,
      vigenteHasta: hasta,
      clavePublica: clavePublica.bytes,
    };
  } catch {
    return undefined;
  }
}

/** PEM si el archivo es texto, DER si empieza como una secuencia. */
function derDelArchivo(archivo: Uint8Array): Uint8Array | undefined {
  if (archivo[0] === 0x30) return archivo;
  try {
    return desdePem('CERTIFICATE', textoAscii(archivo));
  } catch {
    return undefined;
  }
}

/** El valor de un atributo de un Name (SEQUENCE OF SET OF SEQUENCE { oid, valor }). */
function atributo(nombre: Elemento, tipo: string): string | undefined {
  const buscado = oid(tipo);
  for (const conjunto of hijos(nombre)) {
    for (const par of hijos(conjunto)) {
      const [identificador, valor] = hijos(par);
      if (identificador && valor && mismosBytes(identificador.bytes, buscado)) {
        return textoAscii(valor.contenido);
      }
    }
  }
  return undefined;
}

/** UTCTime (AAMMDDHHMMSSZ) o GeneralizedTime (AAAAMMDDHHMMSSZ). */
function leerFecha(elemento: Elemento): Date | undefined {
  const texto = textoAscii(elemento.contenido);
  const partes =
    elemento.etiqueta === 0x17
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(texto)
      : elemento.etiqueta === 0x18
        ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(texto)
        : null;
  if (!partes) return undefined;

  const [, anio = '', mes = '', dia = '', hora = '', minuto = '', segundo = ''] = partes;
  // En UTCTime, los años 50 a 99 son del siglo XX (RFC 5280).
  const anioCompleto =
    anio.length === 2 ? Number(anio) + (Number(anio) >= 50 ? 1900 : 2000) : Number(anio);
  return new Date(
    Date.UTC(
      anioCompleto,
      Number(mes) - 1,
      Number(dia),
      Number(hora),
      Number(minuto),
      Number(segundo),
    ),
  );
}

/** Los textos que se comparan acá son ASCII; un carácter fuera de rango simplemente no coincide. */
function textoAscii(bytes: Uint8Array): string {
  let texto = '';
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return texto;
}

function mismosBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

const invalido = (motivo: MotivoCertificadoInvalido) =>
  fallo<CertificadoInvalido>({ tipo: 'certificado_invalido', motivo });
