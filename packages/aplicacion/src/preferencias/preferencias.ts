import type { ModoDePrecio } from '@facturador/dominio';

import type { AlmacenLocal } from '../puertos/almacenLocal';

const CLAVE_MODO_DE_PRECIO = 'preferencias.modo_de_precio';
const MODO_POR_DEFECTO: ModoDePrecio = 'final';

/**
 * Preferencias del usuario que conviene recordar entre usos. Perder una no hace daño, así que
 * un almacén que falla nunca interrumpe la carga: se usa el valor por defecto.
 */
export interface Preferencias {
  /** Si el usuario carga lo que cobra (precio final) o el neto sin IVA. */
  modoDePrecio(): Promise<ModoDePrecio>;
  recordarModoDePrecio(modo: ModoDePrecio): Promise<void>;
}

export function crearPreferencias(almacen: AlmacenLocal): Preferencias {
  return {
    async modoDePrecio() {
      const guardado = await almacen.leer(CLAVE_MODO_DE_PRECIO).catch(() => undefined);
      return guardado === 'final' || guardado === 'neto' ? guardado : MODO_POR_DEFECTO;
    },
    async recordarModoDePrecio(modo) {
      await almacen.guardar(CLAVE_MODO_DE_PRECIO, modo).catch(() => undefined);
    },
  };
}
