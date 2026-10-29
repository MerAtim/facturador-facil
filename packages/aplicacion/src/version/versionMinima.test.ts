import { describe, expect, it, vi } from 'vitest';

import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import type { AlmacenLocal } from '../puertos/almacenLocal';
import {
  crearControlDeVersion,
  leerVersionMinima,
  VIGENCIA_DE_LA_CONSULTA_MS,
} from './versionMinima';

const publicada = (version: string) => () => Promise.resolve(`{"versionMinima":"${version}"}`);
const sinConexion = () => Promise.reject(new Error('sin conexión'));

const almacenRoto: AlmacenLocal = {
  leer: () => Promise.reject(new Error('disco lleno')),
  guardar: () => Promise.reject(new Error('disco lleno')),
  borrar: () => Promise.reject(new Error('disco lleno')),
};

describe('ControlDeVersion', () => {
  it.each([
    ['1.2.3', '1.2.3', 'vigente'],
    ['1.2.3', '1.2.4', 'desactualizada'],
    ['1.2.3', '1.10.0', 'desactualizada'],
    ['2.0.0', '1.99.99', 'vigente'],
    ['0.1.0', '0.0.0', 'vigente'],
  ])('la versión %s contra la mínima %s queda %s', async (instalada, minima, estado) => {
    const control = crearControlDeVersion({
      instalada,
      publicada: publicada(minima),
      almacen: new AlmacenEnMemoria(),
    });

    await expect(control.consultar()).resolves.toBe(estado);
  });

  it('sin conexión y sin nada conocido, deja emitir', async () => {
    const control = crearControlDeVersion({
      instalada: '1.0.0',
      publicada: sinConexion,
      almacen: new AlmacenEnMemoria(),
    });

    await expect(control.consultar()).resolves.toBe('vigente');
  });

  it('sin conexión, sigue valiendo el último mínimo conocido', async () => {
    const almacen = new AlmacenEnMemoria();
    await crearControlDeVersion({
      instalada: '1.0.0',
      publicada: publicada('1.1.0'),
      almacen,
    }).consultar();

    const sinRed = crearControlDeVersion({ instalada: '1.0.0', publicada: sinConexion, almacen });

    await expect(sinRed.consultar()).resolves.toBe('desactualizada');
  });

  it('una respuesta que no se entiende no cambia lo conocido', async () => {
    const almacen = new AlmacenEnMemoria();
    await crearControlDeVersion({
      instalada: '1.0.0',
      publicada: publicada('1.1.0'),
      almacen,
    }).consultar();

    const control = crearControlDeVersion({
      instalada: '1.0.0',
      publicada: () => Promise.resolve('<html>Not Found</html>'),
      almacen,
    });

    await expect(control.consultar()).resolves.toBe('desactualizada');
  });

  it('si el proyecto baja el mínimo, la versión vuelve a emitir', async () => {
    const almacen = new AlmacenEnMemoria();
    await crearControlDeVersion({
      instalada: '1.0.0',
      publicada: publicada('1.1.0'),
      almacen,
    }).consultar();

    const control = crearControlDeVersion({
      instalada: '1.0.0',
      publicada: publicada('1.0.0'),
      almacen,
    });

    await expect(control.consultar()).resolves.toBe('vigente');
  });

  it('una consulta reciente no se repite', async () => {
    let ahora = 0;
    const consulta = vi.fn(publicada('1.0.0'));
    const control = crearControlDeVersion({
      instalada: '1.0.0',
      publicada: consulta,
      almacen: new AlmacenEnMemoria(),
      ahora: () => ahora,
    });

    await control.consultar();
    ahora = VIGENCIA_DE_LA_CONSULTA_MS - 1;
    await control.consultar();
    expect(consulta).toHaveBeenCalledTimes(1);

    ahora = VIGENCIA_DE_LA_CONSULTA_MS;
    await control.consultar();
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it('una consulta que falló se reintenta la próxima vez', async () => {
    const consulta = vi.fn(sinConexion);
    const control = crearControlDeVersion({
      instalada: '1.0.0',
      publicada: consulta,
      almacen: new AlmacenEnMemoria(),
    });

    await control.consultar();
    await control.consultar();

    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it('las consultas simultáneas se juntan en un pedido', async () => {
    const consulta = vi.fn(publicada('1.0.0'));
    const control = crearControlDeVersion({
      instalada: '1.0.0',
      publicada: consulta,
      almacen: new AlmacenEnMemoria(),
    });

    await Promise.all([control.consultar(), control.consultar()]);

    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('un almacén que falla no impide aplicar el mínimo recién consultado', async () => {
    const control = crearControlDeVersion({
      instalada: '1.0.0',
      publicada: publicada('2.0.0'),
      almacen: almacenRoto,
    });

    await expect(control.consultar()).resolves.toBe('desactualizada');
  });

  it('una versión instalada que no se entiende queda por debajo de cualquier mínimo', async () => {
    const control = crearControlDeVersion({
      instalada: 'desconocida',
      publicada: publicada('0.0.1'),
      almacen: new AlmacenEnMemoria(),
    });

    await expect(control.consultar()).resolves.toBe('desactualizada');
  });
});

describe('leerVersionMinima', () => {
  it('lee la versión publicada', () => {
    expect(leerVersionMinima('{ "versionMinima": "1.2.3" }\n')).toBe('1.2.3');
  });

  it.each([
    ['vacío', ''],
    ['texto', 'Not Found'],
    ['sin el campo', '{}'],
    ['un número', '{"versionMinima":1}'],
    ['otro formato', '{"versionMinima":"1.2"}'],
    ['con sufijo', '{"versionMinima":"1.2.3-beta"}'],
    ['una lista', '["1.2.3"]'],
    ['demasiado largo', `{"versionMinima":"1.2.3","relleno":"${'x'.repeat(1000)}"}`],
  ])('rechaza %s', (_caso, texto) => {
    expect(leerVersionMinima(texto)).toBeUndefined();
  });
});
