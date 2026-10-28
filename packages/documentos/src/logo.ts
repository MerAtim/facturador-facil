import { exito, fallo, type Resultado } from '@facturador/dominio';

/** Una foto de teléfono pesa unos pocos MB: más que esto no es una imagen razonable para un logo. */
export const TAMANIO_MAXIMO_DE_LA_IMAGEN = 10 * 1024 * 1024;

/**
 * Al decodificarla, cada píxel ocupa 4 bytes en memoria: se limita antes de decodificar para que
 * una imagen chica en bytes pero enorme en píxeles no agote la memoria del teléfono.
 */
export const PIXELES_MAXIMOS = 24_000_000;

/** Lo que se imprime mide unos centímetros: con este lado alcanza y el PDF sigue liviano. */
export const LADO_DEL_LOGO = 400;

/** Un PNG de LADO_DEL_LOGO de lado, aun siendo una foto, queda bastante por debajo. */
export const TAMANIO_MAXIMO_DEL_LOGO = 1024 * 1024;

export type FormatoDeImagen = 'png' | 'jpeg';

export interface ImagenInspeccionada {
  readonly formato: FormatoDeImagen;
  readonly ancho: number;
  readonly alto: number;
}

export type MotivoImagenInvalida =
  'archivo_demasiado_grande' | 'formato_no_admitido' | 'imagen_ilegible' | 'demasiados_pixeles';

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_JPEG = [0xff, 0xd8, 0xff];

/**
 * Reconoce la imagen por su contenido, no por el nombre ni el tipo que informa el sistema, y lee
 * sus dimensiones del encabezado sin decodificarla.
 */
export function inspeccionarImagen(
  bytes: Uint8Array,
  tamanioMaximo = TAMANIO_MAXIMO_DE_LA_IMAGEN,
): Resultado<ImagenInspeccionada, MotivoImagenInvalida> {
  if (bytes.length > tamanioMaximo) return fallo('archivo_demasiado_grande');

  let dimensiones: { ancho: number; alto: number } | undefined;
  let formato: FormatoDeImagen;
  if (empiezaCon(bytes, FIRMA_PNG)) {
    formato = 'png';
    dimensiones = dimensionesPng(bytes);
  } else if (empiezaCon(bytes, FIRMA_JPEG)) {
    formato = 'jpeg';
    dimensiones = dimensionesJpeg(bytes);
  } else {
    return fallo('formato_no_admitido');
  }

  if (!dimensiones || dimensiones.ancho === 0 || dimensiones.alto === 0) {
    return fallo('imagen_ilegible');
  }
  if (dimensiones.ancho * dimensiones.alto > PIXELES_MAXIMOS) return fallo('demasiados_pixeles');
  return exito({ formato, ...dimensiones });
}

/** El tamaño al que se lleva la imagen: el lado mayor a LADO_DEL_LOGO, sin agrandar una chica. */
export function tamanioDelLogo({ ancho, alto }: ImagenInspeccionada): {
  readonly ancho: number;
  readonly alto: number;
} {
  const escala = Math.min(1, LADO_DEL_LOGO / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/**
 * El logo ya guardado: un PNG que la app volvió a codificar. Se revisa de nuevo antes de ponerlo
 * en el documento, por si lo guardado se dañó.
 */
export function esLogoValido(bytes: Uint8Array): boolean {
  const imagen = inspeccionarImagen(bytes, TAMANIO_MAXIMO_DEL_LOGO);
  return (
    imagen.ok &&
    imagen.valor.formato === 'png' &&
    Math.max(imagen.valor.ancho, imagen.valor.alto) <= LADO_DEL_LOGO
  );
}

const empiezaCon = (bytes: Uint8Array, firma: readonly number[]) =>
  firma.every((valor, indice) => bytes[indice] === valor);

/** Enteros big endian, como los guardan PNG y JPEG. Quien llama ya comprobó el largo. */
const vista = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** El primer bloque de un PNG es siempre IHDR, con el ancho y el alto. */
function dimensionesPng(bytes: Uint8Array) {
  if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') {
    return undefined;
  }
  const datos = vista(bytes);
  return { ancho: datos.getUint32(16), alto: datos.getUint32(20) };
}

/** Los marcadores SOF de JPEG (salvo los de tablas y aritmética) traen el alto y el ancho. */
const MARCADORES_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Recorre los segmentos hasta el primer SOF. Cada salto avanza, así que el recorrido termina. */
function dimensionesJpeg(bytes: Uint8Array) {
  const datos = vista(bytes);
  let posicion = 2;
  while (posicion + 4 <= bytes.length) {
    if (datos.getUint8(posicion) !== 0xff) return undefined;
    const marcador = datos.getUint8(posicion + 1);
    // Relleno entre segmentos.
    if (marcador === 0xff) {
      posicion++;
      continue;
    }
    // Marcadores sin datos: inicio, fin y reinicios.
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
      if (marcador === 0xd9) return undefined;
      posicion += 2;
      continue;
    }
    const largo = datos.getUint16(posicion + 2);
    if (largo < 2) return undefined;
    if (MARCADORES_SOF.has(marcador)) {
      if (posicion + 9 > bytes.length) return undefined;
      return { alto: datos.getUint16(posicion + 5), ancho: datos.getUint16(posicion + 7) };
    }
    posicion += 2 + largo;
  }
  return undefined;
}
