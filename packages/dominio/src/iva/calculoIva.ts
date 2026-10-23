import type { Dinero } from '../importes/dinero';
import type { AlicuotaIva } from './alicuotaIva';

const BASE = 10_000;

export interface ImportesConIva {
  readonly neto: Dinero;
  readonly iva: Dinero;
  readonly total: Dinero;
}

/**
 * Parte de lo que el emisor quiere cobrar. El IVA se obtiene por diferencia para que el total
 * coincida exactamente con el precio final; la diferencia con `neto × alícuota` nunca supera
 * un centavo, dentro de la tolerancia que acepta ARCA.
 */
export function calcularDesdePrecioFinal(final: Dinero, alicuota: AlicuotaIva): ImportesConIva {
  const neto = final.multiplicarPorFraccion(BASE, BASE + alicuota.puntosBasicos);
  const iva = final.restar(neto);

  if (!iva.ok) throw new Error('El neto no puede superar al precio final');

  return { neto, iva: iva.valor, total: final };
}

export function calcularDesdePrecioNeto(neto: Dinero, alicuota: AlicuotaIva): ImportesConIva {
  const iva = neto.multiplicarPorFraccion(alicuota.puntosBasicos, BASE);
  return { neto, iva, total: neto.sumar(iva) };
}
