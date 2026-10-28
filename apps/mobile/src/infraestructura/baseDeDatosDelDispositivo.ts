import { migrar, type BaseDeDatos, type FilaSql } from '@facturador/aplicacion';
import { getRandomBytesAsync } from 'expo-crypto';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { almacenSeguroDelDispositivo } from './almacenSeguroDelDispositivo';

const NOMBRE = 'facturador.db';
const CLAVE_DE_LA_BASE = 'base.clave';
const CLAVE_HEXADECIMAL = /^[0-9a-f]{64}$/;

/**
 * La clave de la base: 256 bits al azar, guardados en el almacén seguro (Keystore o Keychain).
 * Sin su clave, una base cifrada es ilegible: si la clave falta, se descarta la base que haya y se
 * empieza una nueva, así la app nunca queda trabada con un archivo que no puede abrir.
 */
async function claveDeLaBase(): Promise<string> {
  const guardada = await almacenSeguroDelDispositivo.leer(CLAVE_DE_LA_BASE);
  if (guardada !== undefined && CLAVE_HEXADECIMAL.test(guardada)) return guardada;

  await deleteDatabaseAsync(NOMBRE).catch(() => undefined);
  const bytes = await getRandomBytesAsync(32);
  const clave = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  // La clave se guarda antes de crear la base: nunca hay una base sin su clave.
  await almacenSeguroDelDispositivo.guardar(CLAVE_DE_LA_BASE, clave);
  return clave;
}

/** Abre la base con SQLCipher y la deja en la última versión del esquema. */
async function abrir(): Promise<SQLiteDatabase> {
  const clave = await claveDeLaBase();
  const base = await openDatabaseAsync(NOMBRE);
  // La clave tiene que ser lo primero. PRAGMA no admite parámetros; el valor es hexadecimal
  // validado, generado por la app, nunca un dato del usuario.
  // eslint-disable-next-line no-restricted-syntax
  await base.execAsync(`PRAGMA key = "x'${clave}'"`);
  await migrar(adaptar(base));
  return base;
}

function adaptar(base: SQLiteDatabase): BaseDeDatos {
  return {
    async ejecutar(sql, parametros) {
      if (parametros === undefined) await base.execAsync(sql);
      else await base.runAsync(sql, [...parametros]);
    },
    consultar(sql, parametros = []) {
      return base.getAllAsync<FilaSql>(sql, [...parametros]);
    },
    transaccion(trabajo) {
      return base.withTransactionAsync(trabajo);
    },
  };
}

let abierta: Promise<BaseDeDatos> | undefined;

/** Se abre la primera vez que se usa. Si falla, el próximo uso lo vuelve a intentar. */
function baseAbierta(): Promise<BaseDeDatos> {
  abierta ??= abrir()
    .then(adaptar)
    .catch((error: unknown) => {
      abierta = undefined;
      throw error;
    });
  return abierta;
}

/** La base cifrada del teléfono. Los datos no salen del dispositivo ni entran en respaldos. */
export const baseDeDatosDelDispositivo: BaseDeDatos = {
  async ejecutar(sql, parametros) {
    await (await baseAbierta()).ejecutar(sql, parametros);
  },
  async consultar(sql, parametros) {
    return (await baseAbierta()).consultar(sql, parametros);
  },
  async transaccion(trabajo) {
    await (await baseAbierta()).transaccion(trabajo);
  },
};
