import type { Cuit, Resultado, TipoComprobante } from '@facturador/dominio';

import { URLS, type Ambiente } from '../ambiente';
import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';
import { consultarComprobante, consultarUltimoAutorizado, type ComprobanteEnArca } from './cae';
import { conTicket, type Autorizacion, type ErrorWsfe } from './comun';

/**
 * Lo que ARCA tiene registrado como emitido, para ver desde un dispositivo lo que se facturó desde
 * otro. Solo consulta: no autoriza nada.
 */
export interface ConsultaDeEmitidos {
  /** El último número autorizado de ese punto de venta y tipo; 0 si todavía no hay ninguno. */
  ultimo(
    puntoDeVenta: number,
    tipo: TipoComprobante,
  ): Promise<Resultado<number, ErrorWsfe | ErrorWsaa>>;
  /** El comprobante con ese número, o `undefined` si ARCA no lo tiene. */
  leer(
    puntoDeVenta: number,
    tipo: TipoComprobante,
    numero: number,
  ): Promise<Resultado<ComprobanteEnArca | undefined, ErrorWsfe | ErrorWsaa>>;
}

export interface ConfiguracionDeLaConsulta {
  readonly ambiente: Ambiente;
  readonly cuit: Cuit;
  readonly tickets: ProveedorDeTickets;
  readonly transporte: Transporte;
}

export function crearConsultaDeEmitidos(config: ConfiguracionDeLaConsulta): ConsultaDeEmitidos {
  const url = URLS[config.ambiente].wsfe;
  const llamar = <T, E extends { readonly tipo: string }>(
    consulta: (autorizacion: Autorizacion) => Promise<Resultado<T, E>>,
  ) => conTicket(config.tickets, config.cuit, consulta);

  return {
    ultimo: (puntoDeVenta, tipo) =>
      llamar((autorizacion) =>
        consultarUltimoAutorizado(autorizacion, puntoDeVenta, tipo, config.transporte, url),
      ),
    leer: (puntoDeVenta, tipo, numero) =>
      llamar((autorizacion) =>
        consultarComprobante(autorizacion, puntoDeVenta, tipo, numero, config.transporte, url),
      ),
  };
}
