import type { ClaseComprobante } from '@facturador/dominio';

import { numeroDeComprobante } from './numeroDeComprobante';

/**
 * El texto que acompaña al PDF cuando se comparte. Es una sugerencia: el usuario lo puede cambiar
 * antes de enviarlo.
 */
export function mensajeSugerido(datos: {
  readonly clase: ClaseComprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** El total ya formateado, `$ 1.210,00`. */
  readonly total: string;
  readonly emisor: string;
}): string {
  const numero = numeroDeComprobante(datos.puntoDeVenta, datos.numero);
  return `Hola, te envío la factura ${datos.clase} ${numero} por ${datos.total}. ¡Gracias! ${datos.emisor}`;
}
