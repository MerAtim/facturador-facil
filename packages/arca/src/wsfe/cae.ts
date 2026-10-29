import {
  CODIGO_ARCA_DE_CONCEPTO,
  CODIGO_ARCA_DE_DOCUMENTO,
  FechaCalendario,
  exito,
  fallo,
  type Comprobante,
  type Cuit,
  type IdentificacionReceptor,
  type Resultado,
  type TipoComprobante,
} from '@facturador/dominio';

import type { RespuestaInesperada } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import { buscar, type ElementoXml } from '../soap/xml';
import {
  campo,
  entero,
  leerMensajes,
  llamarWsfe,
  texto,
  type Autorizacion,
  type ErrorDeArca,
  type ErrorWsfe,
} from './comun';

/** Límites de WSFEv1: hasta 5 dígitos para el punto de venta y 8 para el número. */
const MAXIMO_PUNTO_DE_VENTA = 99_999;
const MAXIMO_NUMERO = 99_999_999;

/** WSFEv1 responde con este código cuando no tiene el comprobante consultado. */
const SIN_RESULTADOS = 602;

const FORMATO_CAE = /^\d{14}$/;

/** La app solo factura en pesos, sin conceptos no gravados, exentos ni tributos. */
const CERO = '0.00';

export interface SolicitudDeCae {
  readonly comprobante: Comprobante;
  readonly puntoDeVenta: number;
  /** Tiene que ser el siguiente al último autorizado para ese punto de venta y tipo. */
  readonly numero: number;
}

export interface CaeOtorgado {
  /** El mismo comprobante con el CAE registrado. */
  readonly comprobante: Comprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** ARCA puede aprobar con observaciones: no invalidan el CAE, pero conviene mostrarlas. */
  readonly observaciones: readonly ErrorDeArca[];
}

/** ARCA procesó el comprobante y no lo autorizó. */
export interface ComprobanteRechazado {
  readonly tipo: 'comprobante_rechazado';
  /** Motivos propios del comprobante. */
  readonly observaciones: readonly ErrorDeArca[];
  /** Problemas de la solicitud en general, como el punto de venta. */
  readonly errores: readonly ErrorDeArca[];
}

export interface ComprobanteNoSoportado {
  readonly tipo: 'comprobante_no_soportado';
  readonly motivo: 'ya_autorizado';
}

export type ErrorCae = ErrorWsfe | ComprobanteRechazado | ComprobanteNoSoportado;

const inesperada = fallo<RespuestaInesperada>({ tipo: 'respuesta_inesperada', estado: 200 });

/** Lo que se puede saber sin llamar a ARCA. */
export function verificarSoportado(comprobante: Comprobante): ComprobanteNoSoportado | undefined {
  // Que una nota informe la factura que ajusta ya lo exige el dominio al crearla.
  return comprobante.estaAutorizado()
    ? { tipo: 'comprobante_no_soportado', motivo: 'ya_autorizado' }
    : undefined;
}

/** FECompUltimoAutorizado: el último número autorizado, o 0 si todavía no se emitió ninguno. */
export async function consultarUltimoAutorizado(
  autorizacion: Autorizacion,
  puntoDeVenta: number,
  tipo: TipoComprobante,
  transporte: Transporte,
  url: string,
): Promise<Resultado<number, ErrorWsfe>> {
  verificarRango('punto de venta', puntoDeVenta, MAXIMO_PUNTO_DE_VENTA);

  const respuesta = await llamarWsfe(
    'FECompUltimoAutorizado',
    autorizacion,
    campo('PtoVta', puntoDeVenta) + campo('CbteTipo', tipo.codigoArca),
    transporte,
    url,
  );
  if (!respuesta.ok) return respuesta;

  const resultado = respuesta.valor;
  const errores = leerMensajes(buscar(resultado, 'Errors'));
  if (errores.length > 0) return fallo({ tipo: 'rechazo_wsfe', errores });

  const numero = entero(resultado, 'CbteNro');
  const esLaPedida =
    entero(resultado, 'PtoVta') === puntoDeVenta &&
    entero(resultado, 'CbteTipo') === tipo.codigoArca;
  return numero !== undefined && esLaPedida ? exito(numero) : inesperada;
}

/**
 * FECAESolicitar con un único comprobante. Un rechazo es definitivo: el número no se consumió y
 * se puede volver a pedir corrigiendo el comprobante. Una falla de conexión, en cambio, no dice si
 * ARCA llegó a autorizarlo; eso lo resuelve #26 antes de reintentar.
 */
export async function solicitarCae(
  autorizacion: Autorizacion,
  solicitud: SolicitudDeCae,
  transporte: Transporte,
  url: string,
): Promise<Resultado<CaeOtorgado, ErrorCae>> {
  const { comprobante, puntoDeVenta, numero } = solicitud;
  const noSoportado = verificarSoportado(comprobante);
  if (noSoportado) return fallo(noSoportado);
  verificarRango('punto de venta', puntoDeVenta, MAXIMO_PUNTO_DE_VENTA);
  verificarRango('número', numero, MAXIMO_NUMERO);

  const cabecera =
    campo('CantReg', 1) +
    campo('PtoVta', puntoDeVenta) +
    campo('CbteTipo', comprobante.datos.tipo.codigoArca);
  const respuesta = await llamarWsfe(
    'FECAESolicitar',
    autorizacion,
    `<FeCAEReq><FeCabReq>${cabecera}</FeCabReq>` +
      `<FeDetReq><FECAEDetRequest>${detalle(comprobante, numero, autorizacion.cuit)}</FECAEDetRequest></FeDetReq></FeCAEReq>`,
    transporte,
    url,
  );
  if (!respuesta.ok) return respuesta;

  return leerRespuesta(respuesta.valor, solicitud);
}

/** Los campos van en el orden que exige el esquema de WSFEv1. */
function detalle({ datos, totales }: Comprobante, numero: number, cuitEmisor: Cuit): string {
  const { periodoDeServicio: periodo, asociado } = datos;
  const alicuotas = totales.porAlicuota.map(
    ({ alicuota, neto, iva }) =>
      `<AlicIva>${campo('Id', alicuota.codigoArca)}${campo('BaseImp', neto.aTextoArca())}` +
      `${campo('Importe', iva.aTextoArca())}</AlicIva>`,
  );

  return [
    campo('Concepto', CODIGO_ARCA_DE_CONCEPTO[datos.concepto]),
    campo('DocTipo', CODIGO_ARCA_DE_DOCUMENTO[datos.identificacionReceptor.tipo]),
    campo('DocNro', numeroDeDocumento(datos.identificacionReceptor)),
    campo('CbteDesde', numero),
    campo('CbteHasta', numero),
    campo('CbteFch', datos.fechaDeEmision.aTextoArca()),
    campo('ImpTotal', totales.total.aTextoArca()),
    campo('ImpTotConc', CERO),
    // En la clase C el neto es el total, sin IVA.
    campo('ImpNeto', totales.neto.aTextoArca()),
    campo('ImpOpEx', CERO),
    campo('ImpTrib', CERO),
    campo('ImpIVA', totales.iva.aTextoArca()),
    ...(periodo
      ? [
          campo('FchServDesde', periodo.desde.aTextoArca()),
          campo('FchServHasta', periodo.hasta.aTextoArca()),
          campo('FchVtoPago', periodo.vencimientoDePago.aTextoArca()),
        ]
      : []),
    campo('MonId', 'PES'),
    campo('MonCotiz', 1),
    campo('CondicionIVAReceptorId', datos.receptor.codigoArca),
    // La factura que ajusta una nota es siempre del mismo emisor.
    asociado
      ? '<CbtesAsoc><CbteAsoc>' +
        campo('Tipo', asociado.tipo.codigoArca) +
        campo('PtoVta', asociado.puntoDeVenta) +
        campo('Nro', asociado.numero) +
        campo('Cuit', cuitEmisor.valor) +
        campo('CbteFch', asociado.fechaDeEmision.aTextoArca()) +
        '</CbteAsoc></CbtesAsoc>'
      : '',
    alicuotas.length > 0 ? `<Iva>${alicuotas.join('')}</Iva>` : '',
  ].join('');
}

/** Número que se informa en DocNro: el CUIT, el DNI o 0 si el receptor no se identifica. */
export function numeroDeDocumento(identificacion: IdentificacionReceptor): string {
  switch (identificacion.tipo) {
    case 'cuit':
      return identificacion.cuit.valor;
    case 'dni':
      return identificacion.dni.valor;
    case 'sin_identificar':
      return '0';
  }
}

/**
 * Valida la respuesta antes de que llegue al dominio: una aprobación tiene que ser del comprobante
 * pedido y traer un CAE y un vencimiento válidos. Si no, es una respuesta inesperada.
 */
function leerRespuesta(
  resultado: ElementoXml,
  { comprobante, puntoDeVenta, numero }: SolicitudDeCae,
): Resultado<CaeOtorgado, ErrorCae> {
  const errores = leerMensajes(buscar(resultado, 'Errors'));
  const cabecera = buscar(resultado, 'FeCabResp');
  const respuesta = buscar(resultado, 'FeDetResp', 'FECAEDetResponse');

  // Sin detalle, ARCA rechazó la solicitud antes de mirar el comprobante, por ejemplo por el token.
  if (!cabecera || !respuesta) {
    return errores.length > 0 ? fallo({ tipo: 'rechazo_wsfe', errores }) : inesperada;
  }

  const observaciones = leerMensajes(buscar(respuesta, 'Observaciones'));
  const esElPedido =
    entero(cabecera, 'PtoVta') === puntoDeVenta &&
    entero(cabecera, 'CbteTipo') === comprobante.datos.tipo.codigoArca &&
    entero(respuesta, 'CbteDesde') === numero &&
    entero(respuesta, 'CbteHasta') === numero;

  switch (texto(respuesta, 'Resultado')) {
    case 'R':
      return fallo({ tipo: 'comprobante_rechazado', observaciones, errores });
    case 'A': {
      const vencimiento = FechaCalendario.desdeTextoArca(texto(respuesta, 'CAEFchVto'));
      if (!esElPedido || !vencimiento.ok) return inesperada;

      const autorizado = comprobante.autorizar(texto(respuesta, 'CAE'), vencimiento.valor);
      if (!autorizado.ok) return inesperada;
      return exito({ comprobante: autorizado.valor, puntoDeVenta, numero, observaciones });
    }
    default:
      return inesperada;
  }
}

/** Un valor fuera de rango es un error de programación: los datos llegan ya validados. */
function verificarRango(nombre: string, valor: number, maximo: number) {
  if (!Number.isSafeInteger(valor) || valor < 1 || valor > maximo) {
    throw new RangeError(`El ${nombre} debe ser un entero entre 1 y ${String(maximo)}`);
  }
}

/** Lo que ARCA registró de un comprobante autorizado. */
export interface ComprobanteEnArca {
  readonly puntoDeVenta: number;
  readonly codigoDeTipo: number;
  readonly numero: number;
  readonly fechaDeEmision: FechaCalendario;
  readonly totalEnCentavos: number;
  readonly codigoDeDocumento: number;
  readonly numeroDeDocumento: string;
  readonly cae: string;
  readonly vencimiento: FechaCalendario;
  readonly observaciones: readonly ErrorDeArca[];
}

/**
 * FECompConsultar: el comprobante autorizado con ese número, o `undefined` si ARCA no lo tiene.
 * Es la única forma de saber si una solicitud que se cortó llegó a autorizarse.
 */
export async function consultarComprobante(
  autorizacion: Autorizacion,
  puntoDeVenta: number,
  tipo: TipoComprobante,
  numero: number,
  transporte: Transporte,
  url: string,
): Promise<Resultado<ComprobanteEnArca | undefined, ErrorWsfe>> {
  verificarRango('punto de venta', puntoDeVenta, MAXIMO_PUNTO_DE_VENTA);
  verificarRango('número', numero, MAXIMO_NUMERO);

  const respuesta = await llamarWsfe(
    'FECompConsultar',
    autorizacion,
    `<FeCompConsReq>${campo('CbteTipo', tipo.codigoArca)}${campo('CbteNro', numero)}` +
      `${campo('PtoVta', puntoDeVenta)}</FeCompConsReq>`,
    transporte,
    url,
  );
  if (!respuesta.ok) return respuesta;

  const errores = leerMensajes(buscar(respuesta.valor, 'Errors'));
  if (errores.length > 0) {
    return errores.every((error) => error.codigo === SIN_RESULTADOS)
      ? exito(undefined)
      : fallo({ tipo: 'rechazo_wsfe', errores });
  }

  const comprobante = buscar(respuesta.valor, 'ResultGet');
  if (!comprobante) return inesperada;
  const leido = leerComprobanteEnArca(comprobante);
  const esElPedido =
    leido?.puntoDeVenta === puntoDeVenta &&
    leido.codigoDeTipo === tipo.codigoArca &&
    leido.numero === numero;
  return leido && esElPedido ? exito(leido) : inesperada;
}

function leerComprobanteEnArca(elemento: ElementoXml): ComprobanteEnArca | undefined {
  const puntoDeVenta = entero(elemento, 'PtoVta');
  const codigoDeTipo = entero(elemento, 'CbteTipo');
  const numero = entero(elemento, 'CbteDesde');
  const codigoDeDocumento = entero(elemento, 'DocTipo');
  const fechaDeEmision = FechaCalendario.desdeTextoArca(texto(elemento, 'CbteFch'));
  const vencimiento = FechaCalendario.desdeTextoArca(texto(elemento, 'FchVto'));
  const totalEnCentavos = centavos(texto(elemento, 'ImpTotal'));
  const cae = texto(elemento, 'CodAutorizacion');

  if (
    texto(elemento, 'Resultado') !== 'A' ||
    !FORMATO_CAE.test(cae) ||
    puntoDeVenta === undefined ||
    codigoDeTipo === undefined ||
    numero === undefined ||
    codigoDeDocumento === undefined ||
    totalEnCentavos === undefined ||
    !fechaDeEmision.ok ||
    !vencimiento.ok
  ) {
    return undefined;
  }
  return {
    puntoDeVenta,
    codigoDeTipo,
    numero,
    fechaDeEmision: fechaDeEmision.valor,
    totalEnCentavos,
    codigoDeDocumento,
    numeroDeDocumento: texto(elemento, 'DocNro'),
    cae,
    vencimiento: vencimiento.valor,
    observaciones: leerMensajes(buscar(elemento, 'Observaciones')),
  };
}

/** WSFEv1 devuelve los importes como `double`: `1000`, `2972.5`. */
function centavos(importe: string): number | undefined {
  const [enteros = '', decimales, ...resto] = importe.split('.');
  const valido =
    resto.length === 0 &&
    /^\d{1,13}$/.test(enteros) &&
    (decimales === undefined || /^\d{1,2}$/.test(decimales));
  return valido ? Number(enteros) * 100 + Number((decimales ?? '').padEnd(2, '0')) : undefined;
}
