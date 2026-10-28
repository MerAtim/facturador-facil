import type { BaseDeDatos } from '../puertos/baseDeDatos';

/**
 * Los cambios del esquema, en orden. La posición es la versión: la primera lleva la base a la 1.
 * Una migración publicada no se modifica nunca; para cambiar algo se agrega otra al final.
 */
export const MIGRACIONES: readonly string[] = [
  // 1: los comprobantes que autorizó ARCA. Las columnas sirven para listar y buscar; `datos` guarda
  // todo lo necesario para rearmar el comprobante, en un formato con su propia versión.
  `
  CREATE TABLE comprobantes (
    id INTEGER PRIMARY KEY,
    ambiente TEXT NOT NULL CHECK (ambiente IN ('homologacion', 'produccion')),
    cuit_emisor TEXT NOT NULL,
    tipo INTEGER NOT NULL,
    punto_de_venta INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    total_en_centavos INTEGER NOT NULL,
    receptor TEXT,
    cae TEXT NOT NULL,
    datos TEXT NOT NULL,
    guardado_en INTEGER NOT NULL,
    UNIQUE (ambiente, cuit_emisor, tipo, punto_de_venta, numero)
  );
  CREATE INDEX comprobantes_por_fecha ON comprobantes (ambiente, cuit_emisor, fecha DESC, id DESC);
  `,
];

export class BaseMasNueva extends Error {
  constructor(readonly version: number) {
    super(`La base está en la versión ${String(version)}, más nueva que esta app.`);
    this.name = 'BaseMasNueva';
  }
}

/**
 * Lleva la base a la última versión. Cada migración corre en su propia transacción junto con el
 * cambio de versión, así una falla a mitad de camino deja la base en la versión anterior.
 */
export async function migrar(
  base: BaseDeDatos,
  migraciones: readonly string[] = MIGRACIONES,
): Promise<void> {
  const [fila] = await base.consultar('PRAGMA user_version');
  const actual = Number(fila?.['user_version'] ?? 0);
  // Una app vieja no puede entender una base nueva: mejor frenar que romper datos.
  if (actual > migraciones.length) throw new BaseMasNueva(actual);

  for (const [indice, migracion] of migraciones.entries()) {
    if (indice < actual) continue;
    await base.transaccion(async () => {
      await base.ejecutar(migracion);
      // PRAGMA no admite parámetros. La versión es un entero que calcula la app, no un dato.
      // eslint-disable-next-line no-restricted-syntax
      await base.ejecutar(`PRAGMA user_version = ${String(indice + 1)}`);
    });
  }
}
