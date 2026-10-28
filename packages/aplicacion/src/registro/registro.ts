/**
 * Lo que no puede quedar en un registro. Los patrones son lineales (sin repeticiones anidadas)
 * para que un texto largo no los haga lentos.
 */
const DATOS_SENSIBLES: readonly (readonly [RegExp, string])[] = [
  // Tokens, firmas y certificados en base64: el ticket de WSAA son cientos de caracteres.
  [/[A-Za-z0-9+/]{40,}={0,2}/g, '[TOKEN]'],
  // CAE y otros códigos largos.
  [/\b\d{14}\b/g, '[CAE]'],
  // CUIT, con o sin guiones.
  [/\b\d{2}-?\d{8}-?\d\b/g, '[CUIT]'],
  // DNI, con o sin puntos.
  [/\b\d{1,2}\.?\d{3}\.?\d{3}\b/g, '[DNI]'],
  // Importes con signo pesos.
  [/\$\s?[\d.,]+/g, '[IMPORTE]'],
];

/** Tapa los datos sensibles de un texto antes de registrarlo. */
export function redactar(texto: string): string {
  return DATOS_SENSIBLES.reduce(
    (resultado, [patron, reemplazo]) => resultado.replace(patron, reemplazo),
    texto,
  );
}

export interface Salida {
  depurar(texto: string): void;
  error(texto: string): void;
}

export interface Registro {
  /** Solo en desarrollo. */
  depurar(mensaje: string, datos?: unknown): void;
  /** En producción queda solo el mensaje y el nombre del error, sin su detalle. */
  error(mensaje: string, error?: unknown): void;
}

/**
 * El único lugar donde la app escribe registros. Todo pasa por `redactar`, y en producción no se
 * escribe más que el mensaje fijo de cada error: el detalle de un error de ARCA o de un archivo puede
 * traer datos del contribuyente.
 */
export function crearRegistro({
  produccion,
  salida,
}: {
  readonly produccion: boolean;
  readonly salida: Salida;
}): Registro {
  return {
    depurar(mensaje, datos) {
      if (produccion) return;
      salida.depurar(redactar(datos === undefined ? mensaje : `${mensaje} ${aTexto(datos)}`));
    },
    error(mensaje, error) {
      const tipo = error instanceof Error ? error.name : undefined;
      if (produccion) {
        salida.error(redactar(tipo ? `${mensaje} (${tipo})` : mensaje));
        return;
      }
      salida.error(redactar(error === undefined ? mensaje : `${mensaje} ${aTexto(error)}`));
    },
  };
}

function aTexto(valor: unknown): string {
  if (valor instanceof Error) return `${valor.name}: ${valor.message}`;
  if (typeof valor === 'string') return valor;
  try {
    // Una función o un símbolo no tienen JSON: stringify devuelve undefined.
    const json = JSON.stringify(valor) as string | undefined;
    return json ?? String(valor);
  } catch {
    return '[no se puede mostrar]';
  }
}

/** La parte de la consola que se usa; `aplicacion` no depende de los tipos de un entorno. */
declare const console: {
  log(texto: string): void;
  error(texto: string): void;
};

/** La consola del entorno. Es el único uso permitido de `console` en el proyecto. */
export const salidaDeConsola: Salida = {
  depurar: (texto) => {
    console.log(texto);
  },
  error: (texto) => {
    console.error(texto);
  },
};
