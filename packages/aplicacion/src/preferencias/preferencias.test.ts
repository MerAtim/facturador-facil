import { describe, expect, it } from 'vitest';

import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import type { AlmacenLocal } from '../puertos/almacenLocal';
import { crearPreferencias } from './preferencias';

const almacenRoto: AlmacenLocal = {
  leer: () => Promise.reject(new Error('disco lleno')),
  guardar: () => Promise.reject(new Error('disco lleno')),
  borrar: () => Promise.reject(new Error('disco lleno')),
};

describe('Preferencias', () => {
  it('sin nada guardado, carga por precio final', async () => {
    await expect(crearPreferencias(new AlmacenEnMemoria()).modoDePrecio()).resolves.toBe('final');
  });

  it('recuerda el modo de precio elegido', async () => {
    const almacen = new AlmacenEnMemoria();

    await crearPreferencias(almacen).recordarModoDePrecio('neto');

    await expect(crearPreferencias(almacen).modoDePrecio()).resolves.toBe('neto');
  });

  it('un valor guardado que no reconoce vuelve al precio final', async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar('preferencias.modo_de_precio', 'bruto');

    await expect(crearPreferencias(almacen).modoDePrecio()).resolves.toBe('final');
  });

  it('un almacén que falla no interrumpe la carga', async () => {
    const preferencias = crearPreferencias(almacenRoto);

    await expect(preferencias.recordarModoDePrecio('neto')).resolves.toBeUndefined();
    await expect(preferencias.modoDePrecio()).resolves.toBe('final');
  });
});
