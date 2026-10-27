import { exito, fallo, type Cuit, type Resultado } from '@facturador/dominio';

import { llamarSoap, type ErrorSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import { buscar, escaparXml, type ElementoXml } from '../soap/xml';
import type { TicketDeAcceso } from '../wsaa/wsaa';

const ESPACIO_DE_NOMBRES = 'http://ar.gov.afip.dif.FEV1/';

/** WSFEv1 responde con este código cuando una consulta no tiene resultados. */
const SIN_RESULTADOS = 602;

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

export interface Autorizacion {
  readonly ticket: TicketDeAcceso;
  readonly cuit: Cuit;
}

export interface ErrorDeArca {
  readonly codigo: number;
  readonly mensaje: string;
}

/** WSFEv1 informa los errores de negocio dentro de una respuesta exitosa, no como falla SOAP. */
export interface RechazoWsfe {
  readonly tipo: 'rechazo_wsfe';
  readonly errores: readonly ErrorDeArca[];
}

export type ErrorWsfe = ErrorSoap | RechazoWsfe;

/** Entrada de las tablas de parámetros: tipos de comprobante, alícuotas, monedas. */
export interface ParametroWsfe {
  readonly id: string;
  readonly descripcion: string;
  /** Fecha `AAAAMMDD` desde la que ya no se puede usar. Sin valor, sigue vigente. */
  readonly vigenteHasta?: string;
}

export interface PuntoDeVentaArca {
  readonly numero: number;
  /** Por ejemplo `CAE - Ventanilla` o `CAEA - Ventanilla`. */
  readonly tipoDeEmision: string;
  readonly bloqueado: boolean;
  /** Fecha `AAAAMMDD` de baja. Sin valor, está activo. */
  readonly fechaDeBaja?: string;
}

export interface CondicionIvaReceptorArca {
  readonly id: string;
  readonly descripcion: string;
  /** Clases de comprobante en las que se puede usar, por ejemplo `A/ALEY/C` o `B/C`. */
  readonly clases: string;
}

export const consultarTiposDeComprobante = (
  autorizacion: Autorizacion,
  transporte: Transporte,
  url: string,
) => consultarTabla('FEParamGetTiposCbte', autorizacion, transporte, url, leerParametro);

export const consultarAlicuotasDeIva = (
  autorizacion: Autorizacion,
  transporte: Transporte,
  url: string,
) => consultarTabla('FEParamGetTiposIva', autorizacion, transporte, url, leerParametro);

export const consultarMonedas = (autorizacion: Autorizacion, transporte: Transporte, url: string) =>
  consultarTabla('FEParamGetTiposMonedas', autorizacion, transporte, url, leerParametro);

export const consultarPuntosDeVenta = (
  autorizacion: Autorizacion,
  transporte: Transporte,
  url: string,
) => consultarTabla('FEParamGetPtosVenta', autorizacion, transporte, url, leerPuntoDeVenta);

export const consultarCondicionesIvaReceptor = (
  autorizacion: Autorizacion,
  transporte: Transporte,
  url: string,
) =>
  consultarTabla(
    'FEParamGetCondicionIvaReceptor',
    autorizacion,
    transporte,
    url,
    (elemento): CondicionIvaReceptorArca => ({
      id: texto(elemento, 'Id'),
      descripcion: texto(elemento, 'Desc'),
      clases: texto(elemento, 'Cmp_Clase'),
    }),
  );

async function consultarTabla<T>(
  metodo: string,
  autorizacion: Autorizacion,
  transporte: Transporte,
  url: string,
  leer: (elemento: ElementoXml) => T,
): Promise<Resultado<readonly T[], ErrorWsfe>> {
  const respuesta = await llamarSoap(
    transporte,
    url,
    `${ESPACIO_DE_NOMBRES}${metodo}`,
    `<${metodo} xmlns="${ESPACIO_DE_NOMBRES}">${auth(autorizacion)}</${metodo}>`,
  );
  if (!respuesta.ok) return respuesta;

  // Sin el elemento de resultado no hay forma de distinguir una tabla vacía de una respuesta rota.
  const resultado = buscar(respuesta.valor, `${metodo}Result`);
  if (!resultado) return fallo({ tipo: 'respuesta_inesperada', estado: 200 });

  const errores = leerErrores(resultado);
  if (errores.length > 0) {
    if (errores.every((error) => error.codigo === SIN_RESULTADOS)) return exito([]);
    return fallo({ tipo: 'rechazo_wsfe', errores });
  }

  return exito(buscar(resultado, 'ResultGet')?.hijos.map(leer) ?? []);
}

function auth({ ticket, cuit }: Autorizacion): string {
  return (
    `<Auth><Token>${escaparXml(ticket.token)}</Token><Sign>${escaparXml(ticket.firma)}</Sign>` +
    `<Cuit>${escaparXml(cuit.valor)}</Cuit></Auth>`
  );
}

function leerErrores(resultado: ElementoXml): ErrorDeArca[] {
  return (buscar(resultado, 'Errors')?.hijos ?? []).map((error) => ({
    codigo: Number(texto(error, 'Code')),
    mensaje: texto(error, 'Msg'),
  }));
}

const texto = (elemento: ElementoXml, nombre: string) =>
  buscar(elemento, nombre)?.texto.trim() ?? '';

/** WSFEv1 usa el texto `NULL` para las fechas vacías. */
function fecha(elemento: ElementoXml, nombre: string): string | undefined {
  const valor = texto(elemento, nombre);
  return valor === '' || valor === 'NULL' ? undefined : valor;
}

const leerParametro = (elemento: ElementoXml): ParametroWsfe => {
  const hasta = fecha(elemento, 'FchHasta');
  return {
    id: texto(elemento, 'Id'),
    descripcion: texto(elemento, 'Desc'),
    ...(hasta && { vigenteHasta: hasta }),
  };
};

const leerPuntoDeVenta = (elemento: ElementoXml): PuntoDeVentaArca => {
  const baja = fecha(elemento, 'FchBaja');
  return {
    numero: Number(texto(elemento, 'Nro')),
    tipoDeEmision: texto(elemento, 'EmisionTipo'),
    bloqueado: texto(elemento, 'Bloqueado') === 'S',
    ...(baja && { fechaDeBaja: baja }),
  };
};
