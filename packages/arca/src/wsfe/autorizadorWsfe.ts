import type { AlmacenSeguro } from '@facturador/aplicacion';
import {
  exito,
  fallo,
  type Comprobante,
  type Cuit,
  type Resultado,
  type TipoComprobante,
} from '@facturador/dominio';

import { URLS, type Ambiente } from '../ambiente';
import type { ErrorSoap, RespuestaInesperada } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';
import {
  consultarComprobante,
  consultarUltimoAutorizado,
  solicitarCae,
  verificarSoportado,
  type CaeOtorgado,
  type ComprobanteEnArca,
  type ErrorCae,
} from './cae';
import { conTicket, type Autorizacion, type ErrorWsfe } from './comun';
import { crearPendientes, huellaDe, huellaEnArca, mismaHuella, type Pendiente } from './pendientes';

/**
 * Se envió el comprobante y no se pudo confirmar si ARCA lo autorizó. No se emite otro con ese
 * punto de venta y tipo hasta averiguarlo: reintentar con el mismo comprobante lo resuelve.
 */
export interface ResultadoIncierto {
  readonly tipo: 'resultado_incierto';
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** Por qué no se pudo confirmar. */
  readonly causa: ErrorWsfe | ErrorWsaa;
}

/**
 * ARCA autorizó el comprobante que había quedado incierto, pero el que se quiere emitir ahora es
 * otro. Hay que registrar el anterior; emitir de nuevo numera el nuevo con el número siguiente.
 */
export interface ComprobanteAnteriorAutorizado {
  readonly tipo: 'comprobante_anterior_autorizado';
  readonly anterior: ComprobanteEnArca;
}

/** Sin poder registrar el pendiente no es seguro enviar. */
export interface AlmacenNoDisponible {
  readonly tipo: 'almacen_no_disponible';
}

export type ErrorAutorizacion =
  ErrorCae | ErrorWsaa | ResultadoIncierto | ComprobanteAnteriorAutorizado | AlmacenNoDisponible;

export interface AutorizadorWsfe {
  /**
   * Numera el comprobante con el siguiente al último autorizado y pide su CAE. Si quedó un
   * envío incierto para ese punto de venta y tipo, primero averigua qué pasó con él.
   */
  autorizar(
    comprobante: Comprobante,
    puntoDeVenta: number,
  ): Promise<Resultado<CaeOtorgado, ErrorAutorizacion>>;
}

export interface ConfiguracionDelAutorizador {
  readonly ambiente: Ambiente;
  readonly cuit: Cuit;
  readonly tickets: ProveedorDeTickets;
  readonly transporte: Transporte;
  readonly almacen: AlmacenSeguro;
}

/** Ante estas fallas no se sabe si ARCA llegó a procesar la solicitud. */
const FALLAS_DE_COMUNICACION: readonly string[] = [
  'sin_conexion',
  'respuesta_inesperada',
  'falla_soap',
  'xml_invalido',
] satisfies readonly ErrorSoap['tipo'][];

const esFallaDeComunicacion = (error: ErrorCae | AlmacenNoDisponible): error is ErrorSoap =>
  FALLAS_DE_COMUNICACION.includes(error.tipo);

const almacenNoDisponible = fallo<AlmacenNoDisponible>({ tipo: 'almacen_no_disponible' });
const inesperada = fallo<RespuestaInesperada>({ tipo: 'respuesta_inesperada', estado: 200 });

/**
 * Un turno por punto de venta, compartido entre instancias: dos emisiones simultáneas tomarían
 * el mismo número y ARCA rechazaría la segunda, o una quedaría incierta sin necesidad.
 */
const turnos = new Map<string, Promise<unknown>>();

function enTurno<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const turno = (turnos.get(clave) ?? Promise.resolve()).then(tarea);
  // Un pedido que falla no traba a los siguientes.
  turnos.set(
    clave,
    turno.catch(() => undefined),
  );
  return turno;
}

/**
 * Antes de cada envío guarda una huella del comprobante. Si la respuesta no llega, la usa para
 * preguntarle a ARCA si lo autorizó (FECompUltimoAutorizado y FECompConsultar) en lugar de
 * volver a emitir, que generaría un comprobante duplicado con otro número.
 */
export function crearAutorizadorWsfe(config: ConfiguracionDelAutorizador): AutorizadorWsfe {
  const url = URLS[config.ambiente].wsfe;
  const pendientes = crearPendientes(
    config.almacen,
    `cae.pendiente.${config.ambiente}.${config.cuit.valor}`,
  );

  const llamar = <T, E extends { readonly tipo: string }>(
    consulta: (autorizacion: Autorizacion) => Promise<Resultado<T, E>>,
  ) => conTicket(config.tickets, config.cuit, consulta);

  async function autorizar(
    comprobante: Comprobante,
    puntoDeVenta: number,
  ): Promise<Resultado<CaeOtorgado, ErrorAutorizacion>> {
    const noSoportado = verificarSoportado(comprobante);
    if (noSoportado) return fallo(noSoportado);

    const { tipo } = comprobante.datos;
    const huella = huellaDe(comprobante);
    const olvidar = () =>
      pendientes.borrar(puntoDeVenta, tipo.codigoArca).catch(() => {
        // Si queda, el próximo envío lo resuelve consultando a ARCA.
      });
    const aprobar = (enArca: ComprobanteEnArca) =>
      aprobarConLoConsultado(comprobante, puntoDeVenta, enArca);

    let pendiente: Pendiente | undefined;
    try {
      pendiente = await pendientes.leer(puntoDeVenta, tipo.codigoArca);
    } catch {
      return almacenNoDisponible;
    }

    let ultimo: number | undefined;
    if (pendiente) {
      const estado = await resolver(pendiente, puntoDeVenta, tipo);
      if (!estado.ok) return incierto(puntoDeVenta, pendiente.numero, estado.error);
      await olvidar();

      const { autorizado } = estado.valor;
      if (autorizado) {
        return mismaHuella(huella, pendiente.huella)
          ? aprobar(autorizado)
          : fallo({ tipo: 'comprobante_anterior_autorizado', anterior: autorizado });
      }
      ultimo = estado.valor.ultimo;
    }

    if (ultimo === undefined) {
      const consultado = await llamar((autorizacion) =>
        consultarUltimoAutorizado(autorizacion, puntoDeVenta, tipo, config.transporte, url),
      );
      if (!consultado.ok) return consultado;
      ultimo = consultado.valor;
    }

    const nuevo: Pendiente = { numero: ultimo + 1, huella };
    // La falla de comunicación del último envío, si la hubo. Un rechazo del token no cuenta.
    const envio: { falla?: ErrorSoap } = {};
    const resultado = await llamar(
      async (autorizacion): Promise<Resultado<CaeOtorgado, ErrorCae | AlmacenNoDisponible>> => {
        try {
          await pendientes.guardar(puntoDeVenta, tipo.codigoArca, nuevo);
        } catch {
          return almacenNoDisponible;
        }
        const respuesta = await solicitarCae(
          autorizacion,
          { comprobante, puntoDeVenta, numero: nuevo.numero },
          config.transporte,
          url,
        );
        if (respuesta.ok || !esFallaDeComunicacion(respuesta.error)) delete envio.falla;
        else envio.falla = respuesta.error;
        return respuesta;
      },
    );

    // Una aprobación o un rechazo son definitivos.
    const { falla } = envio;
    if (resultado.ok || !falla) {
      await olvidar();
      return resultado;
    }

    // Se intenta resolver enseguida: si la conexión volvió, no hace falta reintentar.
    const estado = await resolver(nuevo, puntoDeVenta, tipo);
    if (!estado.ok) return incierto(puntoDeVenta, nuevo.numero, falla);
    await olvidar();
    // Si ARCA no lo tiene, el número sigue libre y es seguro reintentar.
    return estado.valor.autorizado ? aprobar(estado.valor.autorizado) : resultado;
  }

  /** Averigua si ARCA autorizó el pendiente. Si no, devuelve el último número autorizado. */
  async function resolver(
    pendiente: Pendiente,
    puntoDeVenta: number,
    tipo: TipoComprobante,
  ): Promise<
    Resultado<
      { readonly ultimo: number; readonly autorizado?: ComprobanteEnArca },
      ErrorWsfe | ErrorWsaa
    >
  > {
    const ultimo = await llamar((autorizacion) =>
      consultarUltimoAutorizado(autorizacion, puntoDeVenta, tipo, config.transporte, url),
    );
    if (!ultimo.ok) return ultimo;
    if (ultimo.valor < pendiente.numero) return exito({ ultimo: ultimo.valor });

    const enArca = await llamar((autorizacion) =>
      consultarComprobante(
        autorizacion,
        puntoDeVenta,
        tipo,
        pendiente.numero,
        config.transporte,
        url,
      ),
    );
    if (!enArca.ok) return enArca;

    // El número puede tenerlo otro comprobante, por ejemplo uno emitido desde el sitio de ARCA.
    const propio =
      enArca.valor && mismaHuella(huellaEnArca(enArca.valor), pendiente.huella)
        ? enArca.valor
        : undefined;
    return exito({ ultimo: ultimo.valor, ...(propio && { autorizado: propio }) });
  }

  return {
    autorizar(comprobante, puntoDeVenta) {
      const clave = `${config.ambiente}.${config.cuit.valor}.${String(puntoDeVenta)}`;
      return enTurno(clave, () => autorizar(comprobante, puntoDeVenta));
    },
  };
}

const incierto = (puntoDeVenta: number, numero: number, causa: ErrorWsfe | ErrorWsaa) =>
  fallo<ResultadoIncierto>({ tipo: 'resultado_incierto', puntoDeVenta, numero, causa });

function aprobarConLoConsultado(
  comprobante: Comprobante,
  puntoDeVenta: number,
  enArca: ComprobanteEnArca,
): Resultado<CaeOtorgado, ErrorAutorizacion> {
  const autorizado = comprobante.autorizar(enArca.cae, enArca.vencimiento);
  if (!autorizado.ok) return inesperada;
  return exito({
    comprobante: autorizado.valor,
    puntoDeVenta,
    numero: enArca.numero,
    observaciones: enArca.observaciones,
  });
}
