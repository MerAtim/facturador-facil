import {
  diasPermitidosParaLaFecha,
  type Concepto,
  type FechaCalendario,
} from '@facturador/dominio';

/**
 * Las fechas que se pueden elegir para un comprobante, con ambos extremos incluidos. ARCA acepta
 * hasta unos días antes o después de hoy y nunca una fecha anterior a la del último comprobante
 * del mismo tipo y punto de venta. Las futuras no se ofrecen: una factura con fecha de mañana
 * impediría hacer otra con la de hoy.
 */
export type RangoDeFecha =
  | {
      readonly tipo: 'rango';
      readonly desde: FechaCalendario;
      readonly hasta: FechaCalendario;
      /** Qué fija el comienzo: el margen de ARCA o el último comprobante. */
      readonly limite: 'margen' | 'ultimo_comprobante';
      readonly diasDeMargen: number;
    }
  /** El último comprobante tiene fecha posterior a hoy: hasta ese día no se puede emitir otro. */
  | { readonly tipo: 'sin_fecha_valida'; readonly desde: FechaCalendario };

export function rangoDeFechaDeEmision({
  hoy,
  concepto,
  ultimaFecha,
}: {
  readonly hoy: FechaCalendario;
  readonly concepto: Concepto;
  readonly ultimaFecha?: FechaCalendario | undefined;
}): RangoDeFecha {
  const diasDeMargen = diasPermitidosParaLaFecha(concepto);
  const porMargen = hoy.sumarDias(-diasDeMargen);
  if (ultimaFecha && hoy.esAnteriorA(ultimaFecha)) {
    return { tipo: 'sin_fecha_valida', desde: ultimaFecha };
  }
  if (ultimaFecha && porMargen.esAnteriorA(ultimaFecha)) {
    return {
      tipo: 'rango',
      desde: ultimaFecha,
      hasta: hoy,
      limite: 'ultimo_comprobante',
      diasDeMargen,
    };
  }
  return { tipo: 'rango', desde: porMargen, hasta: hoy, limite: 'margen', diasDeMargen };
}

/** La fecha elegida si sigue dentro del rango; si no, la más cercana que sí lo está. */
export function ajustarAlRango(fecha: FechaCalendario, rango: RangoDeFecha): FechaCalendario {
  if (rango.tipo === 'sin_fecha_valida') return fecha;
  if (fecha.esAnteriorA(rango.desde)) return rango.desde;
  if (rango.hasta.esAnteriorA(fecha)) return rango.hasta;
  return fecha;
}
