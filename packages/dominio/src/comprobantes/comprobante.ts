import type { FechaCalendario } from '../compartido/fechaCalendario';
import { exito, fallo, type Resultado } from '../compartido/resultado';
import type { IdentificacionReceptor } from '../contribuyente/identificacionReceptor';
import type { Cantidad } from '../importes/cantidad';
import { Dinero } from '../importes/dinero';
import type { AlicuotaIva } from '../iva/alicuotaIva';
import { calcularDesdePrecioFinal, calcularDesdePrecioNeto } from '../iva/calculoIva';
import { incluyeServicios, type Concepto, type PeriodoDeServicio } from './concepto';
import type { CondicionIvaReceptor } from './condicionIvaReceptor';
import type { TipoComprobante } from './tipoComprobante';

export type ModoDePrecio = 'final' | 'neto';

export interface ItemComprobante {
  readonly descripcion: string;
  readonly cantidad: Cantidad;
  readonly precioUnitario: Dinero;
  /** Obligatoria en las clases que informan IVA. En la clase C se ignora. */
  readonly alicuota?: AlicuotaIva;
}

export interface TotalPorAlicuota {
  readonly alicuota: AlicuotaIva;
  readonly neto: Dinero;
  readonly iva: Dinero;
}

export interface Totales {
  readonly neto: Dinero;
  readonly iva: Dinero;
  readonly total: Dinero;
  readonly porAlicuota: readonly TotalPorAlicuota[];
}

export interface Autorizacion {
  readonly cae: string;
  readonly vencimiento: FechaCalendario;
}

export interface DatosComprobante {
  readonly tipo: TipoComprobante;
  readonly receptor: CondicionIvaReceptor;
  readonly identificacionReceptor: IdentificacionReceptor;
  readonly modoDePrecio: ModoDePrecio;
  readonly items: readonly ItemComprobante[];
  readonly fechaDeEmision: FechaCalendario;
  readonly concepto: Concepto;
  readonly periodoDeServicio?: PeriodoDeServicio;
}

export type MotivoComprobanteInvalido =
  | 'sin_items'
  | 'descripcion_vacia'
  | 'falta_alicuota'
  | 'receptor_no_admite_clase'
  | 'falta_periodo_de_servicio'
  | 'periodo_de_servicio_no_corresponde'
  | 'periodo_de_servicio_invertido'
  | 'vencimiento_de_pago_anterior_a_emision'
  | 'cae_invalido'
  | 'ya_autorizado';

export interface ComprobanteInvalido {
  readonly tipo: 'comprobante_invalido';
  readonly motivo: MotivoComprobanteInvalido;
}

const FORMATO_CAE = /^\d{14}$/;

export class Comprobante {
  private constructor(
    readonly datos: DatosComprobante,
    readonly totales: Totales,
    readonly autorizacion?: Autorizacion,
  ) {}

  static crear(datos: DatosComprobante): Resultado<Comprobante, ComprobanteInvalido> {
    const { tipo, receptor, items } = datos;

    if (items.length === 0) return invalido('sin_items');
    if (items.some((item) => item.descripcion.trim() === '')) return invalido('descripcion_vacia');
    if (tipo.informaIva() && items.some((item) => !item.alicuota)) {
      return invalido('falta_alicuota');
    }
    if (!receptor.admiteClase(tipo.clase)) return invalido('receptor_no_admite_clase');

    const errorDeFechas = validarFechas(datos);
    if (errorDeFechas) return invalido(errorDeFechas);

    return exito(new Comprobante(datos, calcularTotales(datos)));
  }

  estaAutorizado(): boolean {
    return this.autorizacion !== undefined;
  }

  /** Registra el CAE que otorgó ARCA. Un comprobante autorizado ya no cambia. */
  autorizar(
    cae: string,
    vencimiento: FechaCalendario,
  ): Resultado<Comprobante, ComprobanteInvalido> {
    if (this.estaAutorizado()) return invalido('ya_autorizado');
    if (!FORMATO_CAE.test(cae)) return invalido('cae_invalido');

    return exito(new Comprobante(this.datos, this.totales, { cae, vencimiento }));
  }
}

const invalido = (motivo: MotivoComprobanteInvalido) =>
  fallo<ComprobanteInvalido>({ tipo: 'comprobante_invalido', motivo });

function validarFechas({
  concepto,
  periodoDeServicio: periodo,
  fechaDeEmision,
}: DatosComprobante): MotivoComprobanteInvalido | undefined {
  if (!incluyeServicios(concepto)) {
    return periodo ? 'periodo_de_servicio_no_corresponde' : undefined;
  }
  if (!periodo) return 'falta_periodo_de_servicio';
  if (periodo.hasta.esAnteriorA(periodo.desde)) return 'periodo_de_servicio_invertido';
  if (periodo.vencimientoDePago.esAnteriorA(fechaDeEmision)) {
    return 'vencimiento_de_pago_anterior_a_emision';
  }
  return undefined;
}

/** Precio unitario por cantidad, redondeado al centavo. En el modo de precio del comprobante. */
export const importeDe = (item: ItemComprobante): Dinero =>
  item.precioUnitario.multiplicarPorFraccion(...item.cantidad.comoFraccion());

const sumar = (importes: readonly Dinero[]): Dinero =>
  importes.reduce((total, importe) => total.sumar(importe), Dinero.CERO);

/**
 * Agrupa por alícuota y calcula neto e IVA una sola vez por grupo: un único redondeo por alícuota,
 * que coincide con el bloque Iva que se informa a ARCA.
 *
 * Es el mismo cálculo que hace `Comprobante.crear`. Las pantallas lo usan para mostrar los totales
 * mientras se carga el comprobante, así lo que se ve coincide con lo que se informa.
 */
export function calcularTotales({
  tipo,
  modoDePrecio,
  items,
}: Pick<DatosComprobante, 'tipo' | 'modoDePrecio' | 'items'>): Totales {
  if (!tipo.informaIva()) {
    const total = sumar(items.map(importeDe));
    return { neto: total, iva: Dinero.CERO, total, porAlicuota: [] };
  }

  const grupos = new Map<AlicuotaIva, Dinero[]>();
  for (const item of items) {
    if (!item.alicuota) continue;
    grupos.set(item.alicuota, [...(grupos.get(item.alicuota) ?? []), importeDe(item)]);
  }

  const calcular = modoDePrecio === 'final' ? calcularDesdePrecioFinal : calcularDesdePrecioNeto;
  const porAlicuota = [...grupos].map(([alicuota, importes]) => {
    const { neto, iva } = calcular(sumar(importes), alicuota);
    return { alicuota, neto, iva };
  });

  const neto = sumar(porAlicuota.map((grupo) => grupo.neto));
  const iva = sumar(porAlicuota.map((grupo) => grupo.iva));
  return { neto, iva, total: neto.sumar(iva), porAlicuota };
}
