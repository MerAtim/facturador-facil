import { describe, expect, it } from 'vitest';

import {
  esLogoValido,
  inspeccionarImagen,
  LADO_DEL_LOGO,
  tamanioDelLogo,
  TAMANIO_MAXIMO_DE_LA_IMAGEN,
} from './logo';

const bytes32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const bytes16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];

/** El comienzo de un PNG: firma y bloque IHDR. Para leer las dimensiones no hace falta más. */
const png = (ancho: number, alto: number) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...bytes32(13),
    ...[0x49, 0x48, 0x44, 0x52],
    ...bytes32(ancho),
    ...bytes32(alto),
    8,
    6,
    0,
    0,
    0,
  ]);

/** Un JPEG con un segmento APP0 antes del SOF, como los de las cámaras. */
const jpeg = (ancho: number, alto: number, sof = 0xc0) =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...bytes16(16),
    ...new Array<number>(14).fill(0),
    0xff,
    0xff, // relleno
    0xff,
    sof,
    ...bytes16(17),
    8,
    ...bytes16(alto),
    ...bytes16(ancho),
    3,
    ...new Array<number>(9).fill(0),
    0xff,
    0xd9,
  ]);

describe('inspeccionarImagen', () => {
  it('reconoce un PNG por su contenido y lee sus dimensiones', () => {
    expect(inspeccionarImagen(png(640, 480))).toEqual({
      ok: true,
      valor: { formato: 'png', ancho: 640, alto: 480 },
    });
  });

  it.each([
    ['baseline', 0xc0],
    ['progresivo', 0xc2],
  ])('reconoce un JPEG %s y lee sus dimensiones', (_, sof) => {
    expect(inspeccionarImagen(jpeg(4032, 3024, sof))).toEqual({
      ok: true,
      valor: { formato: 'jpeg', ancho: 4032, alto: 3024 },
    });
  });

  it.each([
    ['un PDF', new TextEncoder().encode('%PDF-1.7')],
    ['un SVG', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['un GIF', new TextEncoder().encode('GIF89a')],
    ['un archivo vacío', new Uint8Array()],
  ])('rechaza %s aunque se llame .png', (_, contenido) => {
    expect(inspeccionarImagen(contenido)).toEqual({ ok: false, error: 'formato_no_admitido' });
  });

  it.each([
    ['un PNG cortado', png(10, 10).subarray(0, 20)],
    [
      'un PNG sin IHDR',
      new Uint8Array([...png(10, 10).subarray(0, 12), 0, 0, 0, 0, ...new Array<number>(8).fill(1)]),
    ],
    ['un PNG de ancho cero', png(0, 10)],
    ['un JPEG sin SOF', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ['un JPEG cortado', jpeg(10, 10).subarray(0, 24)],
    ['un JPEG con segmentos rotos', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff])],
    [
      'un JPEG con basura entre segmentos',
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0x12, 0x34]),
    ],
  ])('rechaza %s', (_, contenido) => {
    expect(inspeccionarImagen(contenido)).toEqual({ ok: false, error: 'imagen_ilegible' });
  });

  it('saltea los marcadores sin datos antes del SOF', () => {
    const conReinicio = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0x01,
      0xff,
      0xd0,
      ...jpeg(30, 20).subarray(2),
    ]);

    expect(inspeccionarImagen(conReinicio)).toMatchObject({
      ok: true,
      valor: { ancho: 30, alto: 20 },
    });
  });

  it('un JPEG que termina antes del SOF es ilegible', () => {
    const terminado = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0xff, 0xc0, 0, 17, 8, 0, 10, 0, 10]);

    expect(inspeccionarImagen(terminado)).toEqual({ ok: false, error: 'imagen_ilegible' });
  });

  it('un JPEG con un segmento de largo inválido es ilegible', () => {
    expect(inspeccionarImagen(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0, 0]))).toEqual({
      ok: false,
      error: 'imagen_ilegible',
    });
  });

  it('rechaza una imagen con demasiados píxeles antes de decodificarla', () => {
    expect(inspeccionarImagen(png(60_000, 60_000))).toEqual({
      ok: false,
      error: 'demasiados_pixeles',
    });
  });

  it('rechaza un archivo demasiado grande sin mirarlo', () => {
    const enorme = new Uint8Array(TAMANIO_MAXIMO_DE_LA_IMAGEN + 1);
    enorme.set(png(10, 10));

    expect(inspeccionarImagen(enorme)).toEqual({ ok: false, error: 'archivo_demasiado_grande' });
  });
});

describe('tamanioDelLogo', () => {
  it('lleva el lado mayor al del logo y conserva la proporción', () => {
    expect(tamanioDelLogo({ formato: 'jpeg', ancho: 4000, alto: 3000 })).toEqual({
      ancho: LADO_DEL_LOGO,
      alto: 300,
    });
    expect(tamanioDelLogo({ formato: 'png', ancho: 100, alto: 800 })).toEqual({
      ancho: 50,
      alto: LADO_DEL_LOGO,
    });
  });

  it('no agranda una imagen chica', () => {
    expect(tamanioDelLogo({ formato: 'png', ancho: 120, alto: 60 })).toEqual({
      ancho: 120,
      alto: 60,
    });
  });

  it('una imagen muy angosta conserva al menos un píxel', () => {
    expect(tamanioDelLogo({ formato: 'png', ancho: 8000, alto: 2 }).alto).toBe(1);
  });
});

describe('esLogoValido', () => {
  it('acepta el PNG que guardó la app', () => {
    expect(esLogoValido(png(LADO_DEL_LOGO, 200))).toBe(true);
  });

  it('rechaza un JPEG, uno más grande que el logo o uno ilegible', () => {
    expect(esLogoValido(jpeg(200, 200))).toBe(false);
    expect(esLogoValido(png(LADO_DEL_LOGO + 1, 10))).toBe(false);
    expect(esLogoValido(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
