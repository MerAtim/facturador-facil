import type { ModoDePrecio } from '@facturador/dominio';

import { ESPERA_POR_DEFECTO, esEsperaDeBloqueo, type EsperaDeBloqueo } from '../bloqueo/bloqueo';
import type { AlmacenLocal } from '../puertos/almacenLocal';

const CLAVE_MODO_DE_PRECIO = 'preferencias.modo_de_precio';
const MODO_POR_DEFECTO: ModoDePrecio = 'final';
const CLAVE_ESPERA_DE_BLOQUEO = 'preferencias.espera_de_bloqueo';

/**
 * Preferencias del usuario que conviene recordar entre usos. Perder una no hace daño, así que
 * un almacén que falla nunca interrumpe la carga: se usa el valor por defecto.
 */
export interface Preferencias {
  /** Si el usuario carga lo que cobra (precio final) o el neto sin IVA. */
  modoDePrecio(): Promise<ModoDePrecio>;
  recordarModoDePrecio(modo: ModoDePrecio): Promise<void>;
  /** Si se pierde, vuelve a un minuto: un valor seguro. */
  esperaDeBloqueo(): Promise<EsperaDeBloqueo>;
  recordarEsperaDeBloqueo(espera: EsperaDeBloqueo): Promise<void>;
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
    async esperaDeBloqueo() {
      const guardado = await almacen.leer(CLAVE_ESPERA_DE_BLOQUEO).catch(() => undefined);
      return esEsperaDeBloqueo(guardado) ? guardado : ESPERA_POR_DEFECTO;
    },
    async recordarEsperaDeBloqueo(espera) {
      await almacen.guardar(CLAVE_ESPERA_DE_BLOQUEO, espera).catch(() => undefined);
    },
  };
}
