import type { AlmacenLocal } from '../puertos/almacenLocal';

const CLAVE_VERSION_MINIMA = 'version.minima';
const VERSION_VALIDA = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
/** La respuesta esperada ocupa unas decenas de caracteres: algo mucho más grande no es lo publicado. */
const LARGO_MAXIMO_DE_LA_RESPUESTA = 1000;
/** Una consulta que salió bien vale este tiempo: volver a la pantalla no repite el pedido. */
export const VIGENCIA_DE_LA_CONSULTA_MS = 60 * 60 * 1000;

export type EstadoDeVersion = 'vigente' | 'desactualizada';

/**
 * Si una versión publicada tiene una falla grave, el proyecto sube la versión mínima y las que
 * quedan por debajo dejan de emitir. Lo demás, como ver comprobantes o hacer un respaldo, sigue
 * andando: los datos son del usuario.
 */
export interface ControlDeVersion {
  /**
   * Consulta la versión mínima publicada. Sin conexión o con una respuesta que no se entiende, vale
   * la última conocida: así no se esquiva el bloqueo apagando los datos, y sin bloqueo conocido la
   * falta de red no impide el uso diario.
   */
  consultar(): Promise<EstadoDeVersion>;
}

export function crearControlDeVersion({
  instalada,
  publicada,
  almacen,
  ahora = () => Date.now(),
}: {
  /** La versión de la app instalada, como "1.2.3". */
  readonly instalada: string;
  /** El texto publicado por el proyecto, como {"versionMinima":"1.2.3"}. Rechaza si no llega. */
  readonly publicada: () => Promise<string>;
  readonly almacen: AlmacenLocal;
  readonly ahora?: () => number;
}): ControlDeVersion {
  // Una versión instalada que no se entiende queda por debajo de cualquier mínimo.
  const actual = partes(instalada) ?? [0, 0, 0];
  let ultimaConsulta: number | undefined;
  let enCurso: Promise<EstadoDeVersion> | undefined;

  const estadoPara = (minima: string | undefined): EstadoDeVersion => {
    const requerida = minima === undefined ? undefined : partes(minima);
    return requerida && comparar(actual, requerida) < 0 ? 'desactualizada' : 'vigente';
  };

  const recordada = async () => {
    const guardada = await almacen.leer(CLAVE_VERSION_MINIMA).catch(() => undefined);
    return estadoPara(guardada);
  };

  const consultarAhora = async (): Promise<EstadoDeVersion> => {
    const minima = await publicada().then(leerVersionMinima, () => undefined);
    if (minima === undefined) return recordada();

    ultimaConsulta = ahora();
    await almacen.guardar(CLAVE_VERSION_MINIMA, minima).catch(() => undefined);
    return estadoPara(minima);
  };

  return {
    consultar() {
      if (enCurso) return enCurso;
      if (ultimaConsulta !== undefined && ahora() - ultimaConsulta < VIGENCIA_DE_LA_CONSULTA_MS) {
        return recordada();
      }
      enCurso = consultarAhora().finally(() => {
        enCurso = undefined;
      });
      return enCurso;
    },
  };
}

/** La versión mínima del texto publicado, o undefined si no tiene la forma esperada. */
export function leerVersionMinima(texto: string): string | undefined {
  if (texto.length > LARGO_MAXIMO_DE_LA_RESPUESTA) return undefined;
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return undefined;
  }
  if (typeof datos !== 'object' || datos === null || !('versionMinima' in datos)) return undefined;
  const { versionMinima } = datos;
  return typeof versionMinima === 'string' && partes(versionMinima) ? versionMinima : undefined;
}

type Partes = readonly [number, number, number];

function partes(version: string): Partes | undefined {
  const coincidencia = VERSION_VALIDA.exec(version);
  if (!coincidencia) return undefined;
  const [, mayor = '', menor = '', parche = ''] = coincidencia;
  return [Number(mayor), Number(menor), Number(parche)];
}

function comparar(a: Partes, b: Partes): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
