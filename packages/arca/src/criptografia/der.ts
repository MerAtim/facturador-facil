/**
 * Codificación DER mínima para armar el CSR y el CMS que pide ARCA. No es un parser
 * general de ASN.1: solo cubre los tipos que usan esas dos estructuras.
 */

const ETIQUETA = {
  entero: 0x02,
  cadenaBits: 0x03,
  octetos: 0x04,
  nulo: 0x05,
  oid: 0x06,
  utf8: 0x0c,
  imprimible: 0x13,
  utcTime: 0x17,
  secuencia: 0x30,
  conjunto: 0x31,
} as const;

export function concatenar(partes: readonly Uint8Array[]): Uint8Array {
  const total = partes.reduce((suma, parte) => suma + parte.length, 0);
  const resultado = new Uint8Array(total);
  let posicion = 0;
  for (const parte of partes) {
    resultado.set(parte, posicion);
    posicion += parte.length;
  }
  return resultado;
}

function longitud(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  for (let resto = n; resto > 0; resto = Math.floor(resto / 256)) bytes.unshift(resto % 256);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

export function tlv(etiqueta: number, contenido: Uint8Array): Uint8Array {
  return concatenar([Uint8Array.of(etiqueta), longitud(contenido.length), contenido]);
}

export const secuencia = (...hijos: Uint8Array[]) => tlv(ETIQUETA.secuencia, concatenar(hijos));

/** SET OF en DER: los elementos van ordenados por su codificación. */
export function conjunto(...hijos: Uint8Array[]): Uint8Array {
  return tlv(ETIQUETA.conjunto, concatenar([...hijos].sort(compararBytes)));
}

/** Etiqueta de contexto construida, `[n]`. Sirve tanto para EXPLICIT como para IMPLICIT. */
export const contexto = (n: number, contenido: Uint8Array) => tlv(0xa0 | n, contenido);

export const nulo = () => Uint8Array.of(ETIQUETA.nulo, 0);
export const octetos = (bytes: Uint8Array) => tlv(ETIQUETA.octetos, bytes);
export const cadenaBits = (bytes: Uint8Array) =>
  tlv(ETIQUETA.cadenaBits, concatenar([Uint8Array.of(0), bytes]));
export const utf8 = (texto: string) => tlv(ETIQUETA.utf8, new TextEncoder().encode(texto));

export function imprimible(texto: string): Uint8Array {
  if (!/^[A-Za-z0-9 '()+,\-./:=?]*$/.test(texto)) {
    throw new Error(`"${texto}" no es una PrintableString`);
  }
  return tlv(ETIQUETA.imprimible, new TextEncoder().encode(texto));
}

/** Entero sin signo a partir de sus bytes big endian. */
export function entero(bytes: Uint8Array | number): Uint8Array {
  let valor = typeof bytes === 'number' ? bytesDeNumero(bytes) : bytes;
  let inicio = 0;
  while (inicio < valor.length - 1 && valor[inicio] === 0) inicio++;
  valor = valor.subarray(inicio);
  const necesitaCero = (valor[0] ?? 0) >= 0x80;
  return tlv(ETIQUETA.entero, necesitaCero ? concatenar([Uint8Array.of(0), valor]) : valor);
}

function bytesDeNumero(n: number): Uint8Array {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${String(n)} no es un entero válido`);
  const bytes: number[] = [];
  for (let resto = n; resto > 0; resto = Math.floor(resto / 256)) bytes.unshift(resto % 256);
  return Uint8Array.from(bytes.length > 0 ? bytes : [0]);
}

export function oid(texto: string): Uint8Array {
  const [primero = 0, segundo = 0, ...resto] = texto.split('.').map(Number);
  const bytes = [40 * primero + segundo];
  for (const arco of resto) {
    const grupo = [arco & 0x7f];
    for (let valor = Math.floor(arco / 128); valor > 0; valor = Math.floor(valor / 128)) {
      grupo.unshift(0x80 | (valor & 0x7f));
    }
    bytes.push(...grupo);
  }
  return tlv(ETIQUETA.oid, Uint8Array.from(bytes));
}

/** UTCTime en formato AAMMDDHHMMSSZ. Alcanza para fechas entre 1950 y 2049. */
export function utcTime(fecha: Date): Uint8Array {
  const dos = (n: number) => String(n).padStart(2, '0');
  const texto =
    dos(fecha.getUTCFullYear() % 100) +
    dos(fecha.getUTCMonth() + 1) +
    dos(fecha.getUTCDate()) +
    dos(fecha.getUTCHours()) +
    dos(fecha.getUTCMinutes()) +
    dos(fecha.getUTCSeconds()) +
    'Z';
  return tlv(ETIQUETA.utcTime, new TextEncoder().encode(texto));
}

function compararBytes(a: Uint8Array, b: Uint8Array): number {
  const largo = Math.min(a.length, b.length);
  for (let i = 0; i < largo; i++) {
    const diferencia = (a[i] ?? 0) - (b[i] ?? 0);
    if (diferencia !== 0) return diferencia;
  }
  return a.length - b.length;
}

export interface Elemento {
  readonly etiqueta: number;
  /** El elemento completo, con etiqueta y longitud. */
  readonly bytes: Uint8Array;
  readonly contenido: Uint8Array;
}

/** Lee un elemento DER al comienzo de `bytes`, validando que las longitudes no se salgan. */
export function leer(bytes: Uint8Array, desde = 0): Elemento {
  const etiqueta = bytes[desde];
  const primero = bytes[desde + 1];
  if (etiqueta === undefined || primero === undefined) throw new Error('DER truncado');
  if ((etiqueta & 0x1f) === 0x1f) throw new Error('Etiquetas largas no soportadas');

  let largo = primero;
  let inicio = desde + 2;
  if (primero & 0x80) {
    const cantidad = primero & 0x7f;
    if (cantidad === 0 || cantidad > 4) throw new Error('Longitud DER inválida');
    largo = 0;
    for (let i = 0; i < cantidad; i++) {
      const byte = bytes[inicio + i];
      if (byte === undefined) throw new Error('DER truncado');
      largo = largo * 256 + byte;
    }
    inicio += cantidad;
  }

  const fin = inicio + largo;
  if (fin > bytes.length) throw new Error('DER truncado');
  return { etiqueta, bytes: bytes.subarray(desde, fin), contenido: bytes.subarray(inicio, fin) };
}

/** Los hijos directos de un elemento construido (SEQUENCE, SET o contexto). */
export function hijos(elemento: Elemento): Elemento[] {
  const resultado: Elemento[] = [];
  for (let posicion = 0; posicion < elemento.contenido.length;) {
    const hijo = leer(elemento.contenido, posicion);
    resultado.push(hijo);
    posicion += hijo.bytes.length;
  }
  return resultado;
}
