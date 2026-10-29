import {
  Cantidad,
  Comprobante,
  Dinero,
  excedeElSaldo,
  exito,
  fallo,
  saldoAcreditable,
  TipoComprobante,
  type AlicuotaIva,
  type FechaCalendario,
  type ItemComprobante,
  type MotivoComprobanteInvalido,
  type Resultado,
} from '@facturador/dominio';

import type { ComprobanteEmitido } from '../comprobantes/comprobantesEmitidos';

/**
 * Cuánto acredita la nota. La total repite los ítems de la factura, así el PDF muestra lo mismo que
 * se anula. La parcial es un único ítem con el importe a devolver, en el mismo modo de precio que la
 * factura: con IVA si se cargó con precio final, sin IVA si se cargó con neto.
 */
export type AlcanceDeLaNota =
  | { readonly tipo: 'total' }
  | {
      readonly tipo: 'parcial';
      readonly importe: string;
      readonly descripcion: string;
      /** Hace falta solo si la factura tiene ítems con distintas alícuotas. */
      readonly alicuota?: AlicuotaIva;
    };

export interface PedidoDeNotaDeCredito {
  readonly factura: ComprobanteEmitido;
  /** Las notas de crédito que ya ajustaron esa factura. */
  readonly notasPrevias: readonly ComprobanteEmitido[];
  readonly alcance: AlcanceDeLaNota;
  readonly hoy: FechaCalendario;
}

export type ProblemaDeLaNota =
  | { readonly tipo: 'importe_invalido' }
  | { readonly tipo: 'descripcion_vacia' }
  | { readonly tipo: 'falta_alicuota' }
  | { readonly tipo: 'supera_el_saldo' }
  | { readonly tipo: 'comprobante'; readonly motivo: MotivoComprobanteInvalido };

/**
 * Arma la nota de crédito que ajusta una factura emitida. Va al mismo receptor, con el mismo
 * concepto, y nunca acredita más de lo que queda de la factura después de las notas anteriores.
 */
export function prepararNotaDeCredito({
  factura,
  notasPrevias,
  alcance,
  hoy,
}: PedidoDeNotaDeCredito): Resultado<Comprobante, ProblemaDeLaNota> {
  const { datos } = factura.comprobante;
  const items = alcance.tipo === 'total' ? exito(datos.items) : itemParcial(factura, alcance);
  if (!items.ok) return items;

  const periodo = datos.periodoDeServicio;
  const nota = Comprobante.crear({
    tipo: TipoComprobante.de(datos.tipo.clase, 'nota_de_credito'),
    receptor: datos.receptor,
    identificacionReceptor: datos.identificacionReceptor,
    modoDePrecio: datos.modoDePrecio,
    items: items.valor,
    fechaDeEmision: hoy,
    concepto: datos.concepto,
    // El vencimiento de pago no puede ser anterior a la nota: si ya pasó, vence el día que se emite.
    ...(periodo && {
      periodoDeServicio: {
        ...periodo,
        vencimientoDePago: periodo.vencimientoDePago.esAnteriorA(hoy)
          ? hoy
          : periodo.vencimientoDePago,
      },
    }),
    asociado: {
      tipo: datos.tipo,
      puntoDeVenta: factura.puntoDeVenta,
      numero: factura.numero,
      fechaDeEmision: datos.fechaDeEmision,
    },
  });
  if (!nota.ok) return fallo({ tipo: 'comprobante', motivo: nota.error.motivo });

  const saldo = saldoAcreditable(
    factura.comprobante,
    notasPrevias.map((previa) => previa.comprobante),
  );
  return excedeElSaldo(nota.valor, saldo) ? fallo({ tipo: 'supera_el_saldo' }) : nota;
}

function itemParcial(
  factura: ComprobanteEmitido,
  alcance: Extract<AlcanceDeLaNota, { tipo: 'parcial' }>,
): Resultado<readonly ItemComprobante[], ProblemaDeLaNota> {
  const { datos, totales } = factura.comprobante;
  const importe = Dinero.desdeTexto(alcance.importe);
  if (!importe.ok || importe.valor.esCero()) return fallo({ tipo: 'importe_invalido' });
  const descripcion = alcance.descripcion.trim();
  if (descripcion === '') return fallo({ tipo: 'descripcion_vacia' });

  const item = { descripcion, cantidad: Cantidad.UNO, precioUnitario: importe.valor };
  if (!datos.tipo.informaIva()) return exito([item]);

  const alicuotas = totales.porAlicuota.map((grupo) => grupo.alicuota);
  const [unica] = alicuotas;
  const alicuota = alicuotas.length === 1 ? unica : alicuotas.find((a) => a === alcance.alicuota);
  return alicuota ? exito([{ ...item, alicuota }]) : fallo({ tipo: 'falta_alicuota' });
}
