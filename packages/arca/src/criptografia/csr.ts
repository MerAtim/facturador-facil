import type { Cuit } from '@facturador/dominio';

import { aPem } from './codificacion';
import {
  cadenaBits,
  conjunto,
  contexto,
  entero,
  imprimible,
  nulo,
  oid,
  secuencia,
  utf8,
} from './der';
import type { Firmador } from './firmador';
import { OID } from './oids';

export interface DatosDelSolicitante {
  readonly cuit: Cuit;
  /** Razón social o nombre del contribuyente. */
  readonly organizacion: string;
  /** Nombre con el que el certificado aparece en ARCA, por ejemplo "facturadorfacil". */
  readonly nombre: string;
}

/**
 * Solicitud de certificado PKCS#10 con el sujeto que exige ARCA:
 * C=AR, O=organización, CN=nombre y serialNumber=CUIT seguido del número.
 */
export async function crearCsr(datos: DatosDelSolicitante, firmador: Firmador): Promise<string> {
  const sujeto = secuencia(
    atributoDeNombre(OID.pais, imprimible('AR')),
    atributoDeNombre(OID.organizacion, utf8(datos.organizacion)),
    atributoDeNombre(OID.nombreComun, utf8(datos.nombre)),
    atributoDeNombre(OID.numeroDeSerie, imprimible(`CUIT ${datos.cuit.valor}`)),
  );

  const informacion = secuencia(
    entero(0),
    sujeto,
    await firmador.clavePublica(),
    contexto(0, new Uint8Array()),
  );

  const firma = await firmador.firmar(informacion);
  const solicitud = secuencia(
    informacion,
    secuencia(oid(OID.sha256ConRsa), nulo()),
    cadenaBits(firma),
  );

  return aPem('CERTIFICATE REQUEST', solicitud);
}

const atributoDeNombre = (tipo: string, valor: Uint8Array) => conjunto(secuencia(oid(tipo), valor));
