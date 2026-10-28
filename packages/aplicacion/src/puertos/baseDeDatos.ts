export type ValorSql = string | number | null;

export type FilaSql = Readonly<Record<string, ValorSql>>;

/**
 * Una base SQL local. El adaptador real la cifra; acá solo importa ejecutar consultas.
 *
 * El SQL es siempre un texto fijo y los datos van en `parametros`: nunca se arma una consulta
 * pegando valores, así un dato no puede convertirse en código. Una regla de ESLint lo controla.
 */
export interface BaseDeDatos {
  /** Sin parámetros admite varias sentencias, como una migración. */
  ejecutar(sql: string, parametros?: readonly ValorSql[]): Promise<void>;
  consultar(sql: string, parametros?: readonly ValorSql[]): Promise<readonly FilaSql[]>;
  /** Todo o nada: si el trabajo falla, se deshace lo que hizo. */
  transaccion(trabajo: () => Promise<void>): Promise<void>;
}
