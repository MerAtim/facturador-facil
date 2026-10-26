import { exito, type Resultado } from '@facturador/dominio';

import { llamarSoap, type ErrorSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import { buscar } from '../soap/xml';

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

  const texto = (nombre: string) => buscar(respuesta.valor, 'FEDummyResult', nombre)?.texto ?? '';
  return exito({
    aplicacion: texto('AppServer'),
    baseDeDatos: texto('DbServer'),
    autenticacion: texto('AuthServer'),
  });
}
