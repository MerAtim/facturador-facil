import { describe, expect, it } from 'vitest';

import { crearBaseSqliteDePrueba } from './baseSqliteDePrueba';
import { BaseMasNueva, MIGRACIONES, migrar } from './migraciones';

const version = async (base: ReturnType<typeof crearBaseSqliteDePrueba>) =>
  (await base.consultar('PRAGMA user_version'))[0]?.['user_version'];

describe('migrar', () => {
  it('lleva una base nueva a la última versión', async () => {
    const base = crearBaseSqliteDePrueba();

    await migrar(base);

    expect(await version(base)).toBe(MIGRACIONES.length);
    expect(
      await base.consultar("SELECT name FROM sqlite_master WHERE name = 'comprobantes'"),
    ).toEqual([{ name: 'comprobantes' }]);
  });

  it('aplica solo las migraciones que faltan', async () => {
    const base = crearBaseSqliteDePrueba();
    await migrar(base, ['CREATE TABLE a (x INTEGER)']);

    await migrar(base, ['CREATE TABLE a (x INTEGER)', 'CREATE TABLE b (y INTEGER)']);

    expect(await version(base)).toBe(2);
  });

  it('volver a migrar una base al día no hace nada', async () => {
    const base = crearBaseSqliteDePrueba();
    await migrar(base);

    await expect(migrar(base)).resolves.toBeUndefined();
    expect(await version(base)).toBe(MIGRACIONES.length);
  });

  it('una migración que falla no deja cambios a medias ni sube la versión', async () => {
    const base = crearBaseSqliteDePrueba();
    await migrar(base, ['CREATE TABLE a (x INTEGER)']);

    await expect(
      migrar(base, [
        'CREATE TABLE a (x INTEGER)',
        'CREATE TABLE b (y INTEGER); SELECT * FROM nada',
      ]),
    ).rejects.toThrow();

    expect(await version(base)).toBe(1);
    expect(await base.consultar("SELECT name FROM sqlite_master WHERE name = 'b'")).toEqual([]);
  });

  it('no toca una base de una versión más nueva de la app', async () => {
    const base = crearBaseSqliteDePrueba();
    await migrar(base, ['SELECT 1', 'SELECT 1', 'SELECT 1']);

    await expect(migrar(base, ['SELECT 1'])).rejects.toBeInstanceOf(BaseMasNueva);
  });

  it('la versión 2 completa el documento del receptor en lo ya guardado', async () => {
    const base = crearBaseSqliteDePrueba();
    const [version1] = MIGRACIONES;
    await migrar(base, version1 === undefined ? [] : [version1]);
    const insertar = `
      INSERT INTO comprobantes (ambiente, cuit_emisor, tipo, punto_de_venta, numero, fecha,
        total_en_centavos, receptor, cae, datos, guardado_en)
      VALUES ('homologacion', '20111111112', 6, 1, ?, '20261027', 100, ?, 'x', ?, 0)
    `;
    await base.ejecutar(insertar, [
      1,
      'Ferretería Sur',
      JSON.stringify({ receptor: { cuit: '30712345671', nombre: 'Ferretería Sur' } }),
    ]);
    await base.ejecutar(insertar, [
      2,
      '30123456',
      JSON.stringify({ receptor: { dni: '30123456' } }),
    ]);
    await base.ejecutar(insertar, [3, null, JSON.stringify({ receptor: { condicion: 5 } })]);

    await migrar(base);

    expect(
      await base.consultar('SELECT numero, receptor, receptor_documento FROM comprobantes'),
    ).toEqual([
      { numero: 1, receptor: 'Ferretería Sur', receptor_documento: '30712345671' },
      { numero: 2, receptor: null, receptor_documento: '30123456' },
      { numero: 3, receptor: null, receptor_documento: null },
    ]);
  });
});
