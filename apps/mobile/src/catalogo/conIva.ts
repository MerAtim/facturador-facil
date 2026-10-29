import { clasesQuePuedeEmitir, type CondicionEmisor } from '@facturador/dominio';

/** Si el emisor factura IVA: emite A o B y no solo C. Define si un precio puede ser neto. */
export const facturaIva = (condicion: CondicionEmisor): boolean =>
  clasesQuePuedeEmitir(condicion).some((clase) => clase !== 'C');
