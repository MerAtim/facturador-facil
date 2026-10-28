/// <reference types="node" />
// Solo para tests: la app usa la base cifrada del dispositivo. Node trae SQLite, así los tests
// corren el mismo SQL que el teléfono sin depender de código nativo.
// eslint-disable-next-line no-restricted-imports
import { DatabaseSync } from 'node:sqlite';

import type { BaseDeDatos, FilaSql } from '../puertos/baseDeDatos';

export function crearBaseSqliteDePrueba(): BaseDeDatos & { cerrar(): void } {
  const base = new DatabaseSync(':memory:');
  return {
    ejecutar(sql, parametros) {
      return enPromesa(() => {
        if (parametros === undefined) base.exec(sql);
        else base.prepare(sql).run(...parametros);
      });
    },
    consultar(sql, parametros = []) {
      return enPromesa(() => base.prepare(sql).all(...parametros) as FilaSql[]);
    },
    async transaccion(trabajo) {
      base.exec('BEGIN');
      try {
        await trabajo();
        base.exec('COMMIT');
      } catch (error) {
        base.exec('ROLLBACK');
        throw error;
      }
    },
    cerrar() {
      base.close();
    },
  };
}

const enPromesa = <T>(accion: () => T) =>
  new Promise<T>((resolver) => {
    resolver(accion());
  });
