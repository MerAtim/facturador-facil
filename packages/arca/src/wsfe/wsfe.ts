import { exito, type Resultado } from '@facturador/dominio';

import { extraer, llamarSoap, type ErrorSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';

const ESPACIO_DE_NOMBRES = 'http://ar.gov.afip.dif.FEV1/';

export interface EstadoDeServidores {
  readonly aplicacion: string;
  readonly baseDeDatos: string;
  readonly autenticacion: string;
}

/** FEDummy: no requiere ticket de acceso, sirve para comprobar la conexión con WSFEv1. */
export async function consultarEstadoDeServidores(
  transporte: Transporte,
  url: string,
): Promise<Resultado<EstadoDeServidores, ErrorSoap>> {
  const respuesta = await llamarSoap(
    transporte,
    url,
    `${ESPACIO_DE_NOMBRES}FEDummy`,
    `<FEDummy xmlns="${ESPACIO_DE_NOMBRES}"/>`,
  );
  if (!respuesta.ok) return respuesta;

  return exito({
    aplicacion: extraer(respuesta.valor, 'AppServer') ?? '',
    baseDeDatos: extraer(respuesta.valor, 'DbServer') ?? '',
    autenticacion: extraer(respuesta.valor, 'AuthServer') ?? '',
  });
}
