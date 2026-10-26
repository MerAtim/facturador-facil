import { sha256 } from '@noble/hashes/sha2.js';

import {
  conjunto,
  contexto,
  entero,
  hijos,
  leer,
  nulo,
  octetos,
  oid,
  secuencia,
  utcTime,
} from './der';
import type { Firmador } from './firmador';
import { OID } from './oids';

/**
 * CMS SignedData con el contenido incluido, como lo espera WSAA. Equivale a
 * `openssl cms -sign -nodetach -binary -outform DER -md sha256`.
 */
export async function firmarCms(
  contenido: Uint8Array,
  certificado: Uint8Array,
  firmador: Firmador,
  ahora: Date,
): Promise<Uint8Array> {
  const { emisor, numeroDeSerie } = identificarCertificado(certificado);
  const algoritmoResumen = secuencia(oid(OID.sha256), nulo());

  const atributos = [
    atributo(OID.tipoDeContenido, oid(OID.datos)),
    atributo(OID.momentoDeFirma, utcTime(ahora)),
    atributo(OID.resumenDelMensaje, octetos(sha256(contenido))),
  ];

  // Se firma la codificación de los atributos como SET, aunque en el mensaje viajen como [0].
  const firma = await firmador.firmar(conjunto(...atributos));
  const atributosFirmados = conjunto(...atributos);
  atributosFirmados[0] = 0xa0;

  const firmante = secuencia(
    entero(1),
    secuencia(emisor, numeroDeSerie),
    algoritmoResumen,
    atributosFirmados,
    secuencia(oid(OID.rsa), nulo()),
    octetos(firma),
  );

  const datosFirmados = secuencia(
    entero(1),
    conjunto(algoritmoResumen),
    secuencia(oid(OID.datos), contexto(0, octetos(contenido))),
    contexto(0, certificado),
    conjunto(firmante),
  );

  return secuencia(oid(OID.datosFirmados), contexto(0, datosFirmados));
}

const atributo = (tipo: string, valor: Uint8Array) => secuencia(oid(tipo), conjunto(valor));

/** Emisor y número de serie tal como vienen en el certificado X.509, sin reinterpretarlos. */
function identificarCertificado(certificado: Uint8Array) {
  const [tbs] = hijos(leer(certificado));
  if (!tbs) throw new Error('Certificado sin TBSCertificate');

  const campos = hijos(tbs);
  // El campo de versión es opcional y va etiquetado [0].
  const desplazamiento = campos[0]?.etiqueta === 0xa0 ? 1 : 0;
  const numeroDeSerie = campos[desplazamiento];
  const emisor = campos[desplazamiento + 2];
  if (numeroDeSerie?.etiqueta !== 0x02 || emisor?.etiqueta !== 0x30) {
    throw new Error('Certificado X.509 con formato inesperado');
  }

  return { emisor: emisor.bytes, numeroDeSerie: numeroDeSerie.bytes };
}
