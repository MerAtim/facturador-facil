import {
  CODIGO_ARCA_DE_CONCEPTO,
  CODIGO_ARCA_DE_DOCUMENTO,
  FechaCalendario,
  exito,
  fallo,
  type Comprobante,
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
  /** Las notas de débito y crédito tienen que informar el comprobante que ajustan (#46). */
  readonly motivo: 'ya_autorizado' | 'requiere_comprobante_asociado';
}

export type ErrorCae = ErrorWsfe | ComprobanteRechazado | ComprobanteNoSoportado;

const inesperada = fallo<RespuestaInesperada>({ tipo: 'respuesta_inesperada', estado: 200 });

/** Lo que se puede saber sin llamar a ARCA. */
export function verificarSoportado(comprobante: Comprobante): ComprobanteNoSoportado | undefined {
  if (comprobante.estaAutorizado()) {
    return { tipo: 'comprobante_no_soportado', motivo: 'ya_autorizado' };
  }
  if (comprobante.datos.tipo.naturaleza !== 'factura') {
    return { tipo: 'comprobante_no_soportado', motivo: 'requiere_comprobante_asociado' };
  }
  return undefined;
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
      `<FeDetReq><FECAEDetRequest>${detalle(comprobante, numero)}</FECAEDetRequest></FeDetReq></FeCAEReq>`,
    transporte,
    url,
  );
  if (!respuesta.ok) return respuesta;

  return leerRespuesta(respuesta.valor, solicitud);
}

/** Los campos van en el orden que exige el esquema de WSFEv1. */
function detalle({ datos, totales }: Comprobante, numero: number): string {
  const periodo = datos.periodoDeServicio;
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
    alicuotas.length > 0 ? `<Iva>${alicuotas.join('')}</Iva>` : '',
  ].join('');
}

function numeroDeDocumento(identificacion: IdentificacionReceptor): string {
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
