import { fallo, type Comprobante, type Cuit, type Resultado } from '@facturador/dominio';

import { URLS, type Ambiente } from '../ambiente';
import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';
import {
  consultarUltimoAutorizado,
  solicitarCae,
  verificarSoportado,
  type CaeOtorgado,
  type ErrorCae,
} from './cae';
import { conTicket } from './comun';

export type ErrorAutorizacion = ErrorCae | ErrorWsaa;

export interface AutorizadorWsfe {
  /** Numera el comprobante con el siguiente al último autorizado y pide su CAE. */
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
}

/**
 * Atiende de a un comprobante por vez: dos pedidos simultáneos tomarían el mismo número y ARCA
 * rechazaría el segundo.
 */
export function crearAutorizadorWsfe(config: ConfiguracionDelAutorizador): AutorizadorWsfe {
  const url = URLS[config.ambiente].wsfe;
  let anterior: Promise<unknown> = Promise.resolve();

  async function autorizar(
    comprobante: Comprobante,
    puntoDeVenta: number,
  ): Promise<Resultado<CaeOtorgado, ErrorAutorizacion>> {
    const noSoportado = verificarSoportado(comprobante);
    if (noSoportado) return fallo(noSoportado);

    const ultimo = await conTicket(config.tickets, config.cuit, (autorizacion) =>
      consultarUltimoAutorizado(
        autorizacion,
        puntoDeVenta,
        comprobante.datos.tipo,
        config.transporte,
        url,
      ),
    );
    if (!ultimo.ok) return ultimo;

    const solicitud = { comprobante, puntoDeVenta, numero: ultimo.valor + 1 };
    return conTicket(config.tickets, config.cuit, (autorizacion) =>
      solicitarCae(autorizacion, solicitud, config.transporte, url),
    );
  }

  return {
    autorizar(comprobante, puntoDeVenta) {
      const turno = anterior.then(() => autorizar(comprobante, puntoDeVenta));
      // Un pedido que falla no traba a los siguientes.
      anterior = turno.catch(() => undefined);
      return turno;
    },
  };
}
