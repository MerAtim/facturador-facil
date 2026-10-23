import type { FechaCalendario } from '../compartido/fechaCalendario';

export type Concepto = 'productos' | 'servicios' | 'productos_y_servicios';

/** Códigos de FEParamGetTiposConcepto. */
export const CODIGO_ARCA_DE_CONCEPTO: Readonly<Record<Concepto, number>> = {
  productos: 1,
  servicios: 2,
  productos_y_servicios: 3,
};

/** Obligatorio cuando el comprobante incluye servicios. */
export interface PeriodoDeServicio {
  readonly desde: FechaCalendario;
  readonly hasta: FechaCalendario;
  readonly vencimientoDePago: FechaCalendario;
}

export const incluyeServicios = (concepto: Concepto): boolean => concepto !== 'productos';
