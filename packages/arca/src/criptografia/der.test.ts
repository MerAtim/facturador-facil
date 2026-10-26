import { describe, expect, it } from 'vitest';

import { conjunto, entero, hijos, imprimible, leer, octetos, oid, utcTime } from './der';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('der', () => {
  it.each([
    [0, '020100'],
    [127, '02017f'],
    [128, '02020080'],
    [65535, '020300ffff'],
  ])('codifica el entero %d', (valor, esperado) => {
    expect(hex(entero(valor))).toBe(esperado);
  });

  it('quita los ceros sobrantes de un entero en bytes', () => {
    expect(hex(entero(Uint8Array.of(0, 0, 0x01)))).toBe('020101');
  });

  it('rechaza enteros negativos o no exactos', () => {
    expect(() => entero(-1)).toThrow();
    expect(() => entero(1.5)).toThrow();
  });

  it('codifica identificadores de objeto', () => {
    expect(hex(oid('2.16.840.1.101.3.4.2.1'))).toBe('0609608648016503040201');
    expect(hex(oid('1.2.840.113549.1.1.11'))).toBe('06092a864886f70d01010b');
  });

  it('usa longitud larga a partir de 128 bytes', () => {
    expect(hex(octetos(new Uint8Array(200)).subarray(0, 3))).toBe('0481c8');
    expect(hex(octetos(new Uint8Array(300)).subarray(0, 4))).toBe('0482012c');
  });

  it('ordena los elementos de un SET por su codificación', () => {
    expect(hex(conjunto(entero(2), entero(1)))).toBe('3106020101020102');
  });

  it('codifica fechas como UTCTime', () => {
    expect(new TextDecoder().decode(utcTime(new Date('2026-03-04T05:06:07Z')).subarray(2))).toBe(
      '260304050607Z',
    );
  });

  it('acepta solo caracteres de PrintableString', () => {
    expect(() => imprimible('CUIT 20123456786')).not.toThrow();
    expect(() => imprimible('ñandú')).toThrow();
  });

  it('lee elementos y sus hijos', () => {
    const elemento = leer(conjunto(entero(1), octetos(new Uint8Array(200))));

    expect(elemento.etiqueta).toBe(0x31);
    expect(hijos(elemento).map((hijo) => hijo.etiqueta)).toEqual([0x02, 0x04]);
  });

  it.each([
    ['vacío', ''],
    ['sin contenido suficiente', '0405aabb'],
    ['con etiqueta larga', '1f0100'],
    ['con longitud indefinida', '0480'],
    ['con longitud truncada', '0482ff'],
  ])('rechaza un DER %s', (_, bytes) => {
    expect(() => leer(Uint8Array.from(Buffer.from(bytes, 'hex')))).toThrow();
  });
});
