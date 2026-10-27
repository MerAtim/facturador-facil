import type { AlmacenSeguro } from '@facturador/aplicacion';
import { exito, type Cuit, type Resultado } from '@facturador/dominio';

import { URLS, type Ambiente } from '../ambiente';
import type { Firmador } from '../criptografia/firmador';
import type { Transporte } from '../soap/transporte';
import { solicitarTicket, type ErrorWsaa, type TicketDeAcceso } from './wsaa';

/** Se renueva antes de vencer para que una operación en curso no se quede sin ticket a mitad de camino. */
const MARGEN_DE_RENOVACION_MS = 10 * 60 * 1000;

export interface ConfiguracionDeTickets {
  readonly ambiente: Ambiente;
  readonly cuit: Cuit;
  /** Servicio de ARCA para el que se pide acceso, por ejemplo "wsfe". */
  readonly servicio: string;
  /** Certificado X.509 que ARCA emitió para la clave del firmador, en DER. */
  readonly certificado: Uint8Array;
  readonly firmador: Firmador;
  readonly transporte: Transporte;
  readonly almacen: AlmacenSeguro;
  readonly reloj?: () => Date;
}

export interface ProveedorDeTickets {
  /** Devuelve el ticket guardado mientras siga vigente y si no, pide uno nuevo a WSAA. */
  obtener(): Promise<Resultado<TicketDeAcceso, ErrorWsaa>>;
  /** Descarta el ticket guardado, por ejemplo si ARCA lo rechaza antes de su vencimiento. */
  invalidar(): Promise<void>;
}

/**
 * WSAA entrega un ticket por servicio que dura unas 12 horas. En producción rechaza un pedido
 * nuevo mientras el anterior siga vigente (coe.alreadyAuthenticated), así que el ticket se
 * guarda en el almacén seguro para sobrevivir a reinicios de la app.
 */
export function crearProveedorDeTickets(config: ConfiguracionDeTickets): ProveedorDeTickets {
  const reloj = config.reloj ?? (() => new Date());
  const clave = `ticket.${config.ambiente}.${config.cuit.valor}.${config.servicio}`;
  let enMemoria: TicketDeAcceso | undefined;
  let pedidoEnCurso: Promise<Resultado<TicketDeAcceso, ErrorWsaa>> | undefined;

  const vigente = (ticket: TicketDeAcceso | undefined) =>
    ticket && ticket.vencimiento.getTime() - MARGEN_DE_RENOVACION_MS > reloj().getTime()
      ? ticket
      : undefined;

  async function renovar(): Promise<Resultado<TicketDeAcceso, ErrorWsaa>> {
    const guardado = vigente(await leerGuardado(config.almacen, clave));
    if (guardado) {
      enMemoria = guardado;
      return exito(guardado);
    }

    const resultado = await solicitarTicket(
      { servicio: config.servicio, certificado: config.certificado, ahora: reloj() },
      config.firmador,
      config.transporte,
      URLS[config.ambiente].wsaa,
    );
    if (resultado.ok) {
      enMemoria = resultado.valor;
      await guardar(config.almacen, clave, resultado.valor);
    }
    return resultado;
  }

  return {
    obtener() {
      const enCache = vigente(enMemoria);
      if (enCache) return Promise.resolve(exito(enCache));

      // Los pedidos simultáneos comparten una sola llamada a WSAA.
      pedidoEnCurso ??= renovar().finally(() => {
        pedidoEnCurso = undefined;
      });
      return pedidoEnCurso;
    },

    async invalidar() {
      enMemoria = undefined;
      await config.almacen.borrar(clave);
    },
  };
}

interface TicketGuardado {
  readonly token: string;
  readonly firma: string;
  readonly vencimiento: string;
}

/** Un ticket ilegible o un almacén que falla equivalen a no tener ticket: se pide otro. */
async function leerGuardado(
  almacen: AlmacenSeguro,
  clave: string,
): Promise<TicketDeAcceso | undefined> {
  try {
    const texto = await almacen.leer(clave);
    if (texto === undefined) return undefined;

    const { token, firma, vencimiento } = JSON.parse(texto) as Partial<TicketGuardado>;
    const fecha = new Date(vencimiento ?? '');
    if (typeof token !== 'string' || typeof firma !== 'string' || Number.isNaN(fecha.getTime())) {
      return undefined;
    }
    return { token, firma, vencimiento: fecha };
  } catch {
    return undefined;
  }
}

/**
 * Si no se puede guardar, el ticket igual sirve mientras la app siga abierta, así que no se
 * descarta un ticket válido por una falla del almacén.
 */
async function guardar(almacen: AlmacenSeguro, clave: string, ticket: TicketDeAcceso) {
  const guardado: TicketGuardado = {
    token: ticket.token,
    firma: ticket.firma,
    vencimiento: ticket.vencimiento.toISOString(),
  };
  try {
    await almacen.guardar(clave, JSON.stringify(guardado));
  } catch {
    // Sin almacén se pierde solo la persistencia entre reinicios.
  }
}
