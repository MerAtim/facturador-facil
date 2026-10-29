import type { TipoComprobante } from '@facturador/dominio';

import { numeroDeComprobante } from './numeroDeComprobante';

/**
 * El texto que acompaña al PDF cuando se comparte. Es una sugerencia: el usuario lo puede cambiar
 * antes de enviarlo.
 */
export function mensajeSugerido(datos: {
  readonly tipo: TipoComprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
  /** El total ya formateado, `$ 1.210,00`. */
  readonly total: string;
  readonly emisor: string;
}): string {
  const numero = numeroDeComprobante(datos.puntoDeVenta, datos.numero);
  const comprobante = `${datos.tipo.nombre.toLowerCase()} ${datos.tipo.clase}`;
  return `Hola, te envío la ${comprobante} ${numero} por ${datos.total}. ¡Gracias! ${datos.emisor}`;
}
