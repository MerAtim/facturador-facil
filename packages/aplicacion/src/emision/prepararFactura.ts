import {
  Cantidad,
  Comprobante,
  Dinero,
  exito,
  fallo,
  validarParaEnvio,
  type FechaCalendario,
  type ModoDePrecio,
  type MotivoComprobanteInvalido,
  type ProblemaDeEnvio,
  type Receptor,
  type Resultado,
  type TipoComprobante,
} from '@facturador/dominio';

import { cantidadDelBorrador, itemDelBorrador, type BorradorDeItem } from './borradorDeFactura';

/**
 * Total desde el que hay que identificar al consumidor final con DNI o CUIT. Lo fija ARCA por
 * resolución (RG 5700/2025) y homologación lo aplica: una factura B de $ 10.000.000 sin identificar
 * se rechaza con el código 10015.
 */
export const MONTO_PARA_IDENTIFICAR_CONSUMIDOR_FINAL: Dinero = montoFijo(1_000_000_000);

export interface BorradorDeFactura {
  readonly tipo: TipoComprobante;
  readonly receptor: Receptor;
  readonly modoDePrecio: ModoDePrecio;
  readonly items: readonly BorradorDeItem[];
  readonly hoy: FechaCalendario;
}

/** Lo que impide emitir, para mostrarlo junto a donde se corrige. Los ítems se numeran desde 1. */
export type ProblemaDeLaFactura =
  | { readonly tipo: 'item_sin_descripcion'; readonly item: number }
  | { readonly tipo: 'item_sin_precio'; readonly item: number }
  | { readonly tipo: 'item_con_cantidad_invalida'; readonly item: number }
  | { readonly tipo: 'envio'; readonly problema: ProblemaDeEnvio }
  | { readonly tipo: 'comprobante'; readonly motivo: MotivoComprobanteInvalido };

/**
 * Convierte lo cargado en pantalla en un comprobante listo para enviar a ARCA, o devuelve todos los
 * problemas juntos. Por ahora se factura el concepto productos, que no pide período de servicio.
 */
export function prepararFactura(
  borrador: BorradorDeFactura,
): Resultado<Comprobante, readonly ProblemaDeLaFactura[]> {
  const problemasDeItems = borrador.items.flatMap((item, indice) =>
    problemasDelItem(item, indice + 1),
  );
  if (problemasDeItems.length > 0) return fallo(problemasDeItems);

  const comprobante = Comprobante.crear({
    tipo: borrador.tipo,
    receptor: borrador.receptor.condicion,
    identificacionReceptor: borrador.receptor.identificacion,
    modoDePrecio: borrador.modoDePrecio,
    items: borrador.items.map(itemDelBorrador),
    fechaDeEmision: borrador.hoy,
    concepto: 'productos',
  });
  if (!comprobante.ok) return fallo([{ tipo: 'comprobante', motivo: comprobante.error.motivo }]);

  const problemasDeEnvio = validarParaEnvio(comprobante.valor, {
    hoy: borrador.hoy,
    montoParaIdentificarConsumidorFinal: MONTO_PARA_IDENTIFICAR_CONSUMIDOR_FINAL,
  });
  if (problemasDeEnvio.length > 0) {
    return fallo(problemasDeEnvio.map((problema) => ({ tipo: 'envio' as const, problema })));
  }

  return exito(comprobante.valor);
}

function problemasDelItem(item: BorradorDeItem, numero: number): ProblemaDeLaFactura[] {
  const problemas: ProblemaDeLaFactura[] = [];
  if (item.descripcion.trim() === '')
    problemas.push({ tipo: 'item_sin_descripcion', item: numero });
  if (!(cantidadDelBorrador(item.cantidad) instanceof Cantidad)) {
    problemas.push({ tipo: 'item_con_cantidad_invalida', item: numero });
  }
  if (itemDelBorrador(item).precioUnitario.esCero()) {
    problemas.push({ tipo: 'item_sin_precio', item: numero });
  }
  return problemas;
}

function montoFijo(centavos: number): Dinero {
  const monto = Dinero.desdeCentavos(centavos);
  if (!monto.ok) throw new Error(`Monto fijo inválido: ${String(centavos)}`);
  return monto.valor;
}
