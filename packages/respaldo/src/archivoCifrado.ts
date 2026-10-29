import type {
  CifradoDeRespaldos,
  MotivoRespaldoIlegible,
  RespaldoIlegible,
} from '@facturador/aplicacion';
import { exito, fallo, type Resultado } from '@facturador/dominio';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

/**
 * El archivo de respaldo: un único binario, sin zip ni nada que se descomprima en carpetas.
 *
 * | bytes | contenido                                            |
 * | ----- | ---------------------------------------------------- |
 * | 0-5   | `FFRESP`                                             |
 * | 6     | versión del formato, 1                               |
 * | 7     | derivación de la clave: 1 es PBKDF2-HMAC-SHA256      |
 * | 8-11  | iteraciones, entero sin signo big endian             |
 * | 12-27 | sal                                                  |
 * | 28-51 | nonce de XChaCha20-Poly1305                          |
 * | 52-   | contenido cifrado y etiqueta de 16 bytes             |
 *
 * El encabezado entero va como dato asociado: cambiar un parámetro invalida la etiqueta.
 */
const MAGIA = new TextEncoder().encode('FFRESP');
const VERSION = 1;
const PBKDF2_SHA256 = 1;
const INICIO_DE_LA_SAL = MAGIA.length + 6;
const LARGO_DE_LA_SAL = 16;
const LARGO_DEL_NONCE = 24;
const LARGO_DEL_ENCABEZADO = INICIO_DE_LA_SAL + LARGO_DE_LA_SAL + LARGO_DEL_NONCE;
const LARGO_DE_LA_ETIQUETA = 16;
const LARGO_DE_LA_CLAVE = 32;

/** Más que cualquier respaldo razonable: un archivo más grande no se procesa. */
export const TAMANIO_MAXIMO_DEL_RESPALDO = 64 * 1024 * 1024;

/**
 * Lo que recomienda OWASP para PBKDF2-HMAC-SHA256. Va en el archivo, así se puede subir después
 * sin dejar de leer los respaldos viejos.
 */
export const ITERACIONES = 600_000;

/** Un archivo ajeno no puede pedir un costo que cuelgue el teléfono ni uno que no proteja nada. */
const ITERACIONES_ADMITIDAS = { minimo: 100_000, maximo: 10_000_000 };

/** Bytes aleatorios del sistema. Se inyectan porque cada plataforma los obtiene a su manera. */
export type Aleatorio = (cantidad: number) => Uint8Array;

/**
 * PBKDF2-HMAC-SHA256 de 32 bytes sobre la contraseña en UTF-8. Se inyecta porque en el teléfono
 * corre en código nativo: en JavaScript tardaría demasiado con un costo que proteja.
 */
export type DerivarClave = (
  contrasena: Uint8Array,
  sal: Uint8Array,
  iteraciones: number,
) => Promise<Uint8Array>;

export interface PlataformaDelCifrado {
  readonly aleatorio: Aleatorio;
  readonly derivar: DerivarClave;
}

export async function cifrarRespaldo(
  contenido: Uint8Array,
  contrasena: string,
  { aleatorio, derivar }: PlataformaDelCifrado,
  iteraciones: number = ITERACIONES,
): Promise<Uint8Array> {
  const sal = aleatorio(LARGO_DE_LA_SAL);
  const nonce = aleatorio(LARGO_DEL_NONCE);
  if (sal.length !== LARGO_DE_LA_SAL || nonce.length !== LARGO_DEL_NONCE) {
    throw new Error('La fuente aleatoria no devolvió la cantidad pedida');
  }
  const encabezado = new Uint8Array(LARGO_DEL_ENCABEZADO);
  encabezado.set(MAGIA, 0);
  encabezado.set([VERSION, PBKDF2_SHA256], MAGIA.length);
  new DataView(encabezado.buffer).setUint32(MAGIA.length + 2, iteraciones);
  encabezado.set(sal, INICIO_DE_LA_SAL);
  encabezado.set(nonce, INICIO_DE_LA_SAL + LARGO_DE_LA_SAL);

  const clave = await derivarClave(derivar, contrasena, sal, iteraciones);
  const cifrado = xchacha20poly1305(clave, nonce, encabezado).encrypt(contenido);
  clave.fill(0);

  const archivo = new Uint8Array(encabezado.length + cifrado.length);
  archivo.set(encabezado, 0);
  archivo.set(cifrado, encabezado.length);
  return archivo;
}

/**
 * Todo se controla antes de derivar la clave, que es lo caro: el tamaño, el formato y que el costo
 * pedido esté en un rango razonable. Después, la etiqueta prueba que nada cambió antes de que el
 * contenido llegue a interpretarse.
 */
export async function descifrarRespaldo(
  archivo: Uint8Array,
  contrasena: string,
  { derivar }: Pick<PlataformaDelCifrado, 'derivar'>,
): Promise<Resultado<Uint8Array, RespaldoIlegible>> {
  if (archivo.length > TAMANIO_MAXIMO_DEL_RESPALDO) return ilegible('demasiado_grande');
  if (
    archivo.length < LARGO_DEL_ENCABEZADO + LARGO_DE_LA_ETIQUETA ||
    !MAGIA.every((byte, indice) => archivo[indice] === byte)
  ) {
    return ilegible('no_es_un_respaldo');
  }

  if (archivo[MAGIA.length] !== VERSION) return ilegible('version_desconocida');
  const iteraciones = new DataView(archivo.buffer, archivo.byteOffset).getUint32(MAGIA.length + 2);
  if (
    archivo[MAGIA.length + 1] !== PBKDF2_SHA256 ||
    iteraciones < ITERACIONES_ADMITIDAS.minimo ||
    iteraciones > ITERACIONES_ADMITIDAS.maximo
  ) {
    return ilegible('costo_no_admitido');
  }

  const encabezado = archivo.subarray(0, LARGO_DEL_ENCABEZADO);
  const sal = encabezado.subarray(INICIO_DE_LA_SAL, INICIO_DE_LA_SAL + LARGO_DE_LA_SAL);
  const nonce = encabezado.subarray(INICIO_DE_LA_SAL + LARGO_DE_LA_SAL);
  const clave = await derivarClave(derivar, contrasena, sal, iteraciones);
  try {
    return exito(
      xchacha20poly1305(clave, nonce, encabezado).decrypt(archivo.subarray(LARGO_DEL_ENCABEZADO)),
    );
  } catch {
    return ilegible('contrasena_incorrecta_o_archivo_danado');
  } finally {
    clave.fill(0);
  }
}

/** El cifrado de la app, con la plataforma del teléfono. */
export function crearCifradoDeRespaldos(
  plataforma: PlataformaDelCifrado,
  iteraciones: number = ITERACIONES,
): CifradoDeRespaldos {
  return {
    cifrar: (contenido, contrasena) =>
      cifrarRespaldo(contenido, contrasena, plataforma, iteraciones),
    descifrar: (archivo, contrasena) => descifrarRespaldo(archivo, contrasena, plataforma),
  };
}

/** La misma contraseña escrita en otro teclado puede llegar con otra forma Unicode. */
async function derivarClave(
  derivar: DerivarClave,
  contrasena: string,
  sal: Uint8Array,
  iteraciones: number,
): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(contrasena.normalize('NFC'));
  try {
    const clave = await derivar(bytes, sal, iteraciones);
    if (clave.length !== LARGO_DE_LA_CLAVE) throw new Error('La clave derivada no mide 32 bytes');
    return clave;
  } finally {
    bytes.fill(0);
  }
}

const ilegible = (motivo: MotivoRespaldoIlegible) =>
  fallo<RespaldoIlegible>({ tipo: 'respaldo_ilegible', motivo });
