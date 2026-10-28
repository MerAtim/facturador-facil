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

  it('la espera de bloqueo es de un minuto si no se eligió otra', async () => {
    await expect(crearPreferencias(new AlmacenEnMemoria()).esperaDeBloqueo()).resolves.toBe(
      'un_minuto',
    );
  });

  it('recuerda la espera de bloqueo elegida', async () => {
    const almacen = new AlmacenEnMemoria();
    await crearPreferencias(almacen).recordarEsperaDeBloqueo('al_instante');

    await expect(crearPreferencias(almacen).esperaDeBloqueo()).resolves.toBe('al_instante');
  });

  it('una espera guardada que no reconoce vuelve a un minuto', async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.guardar('preferencias.espera_de_bloqueo', 'nunca');

    await expect(crearPreferencias(almacen).esperaDeBloqueo()).resolves.toBe('un_minuto');
  });

  it('si el almacén falla, la espera de bloqueo es la segura', async () => {
    const preferencias = crearPreferencias(almacenRoto);

    await expect(preferencias.recordarEsperaDeBloqueo('cinco_minutos')).resolves.toBeUndefined();
    await expect(preferencias.esperaDeBloqueo()).resolves.toBe('un_minuto');
  });
});
