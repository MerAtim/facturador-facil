import { describe, expect, it } from 'vitest';

import { formatearEntradaDeImporte, importeEscrito } from './entradaDeImporte';

describe('formatearEntradaDeImporte', () => {
  it.each([
    ['', ''],
    ['5', '5'],
    ['1234', '1.234'],
    ['1234567', '1.234.567'],
    ['1.2345', '12.345'],
    ['1234,5', '1.234,5'],
    ['1234,56', '1.234,56'],
  ])('"%s" se muestra "%s"', (escrito, mostrado) => {
    expect(formatearEntradaDeImporte(escrito)).toBe(mostrado);
  });

  it('conserva la coma recién escrita para seguir con los decimales', () => {
    expect(formatearEntradaDeImporte('1.234,')).toBe('1.234,');
  });

  it('un punto recién escrito es la coma decimal', () => {
    expect(formatearEntradaDeImporte('1.234.')).toBe('1.234,');
    expect(formatearEntradaDeImporte('12.')).toBe('12,');
  });

  it('con la coma ya escrita, un punto no la duplica', () => {
    expect(formatearEntradaDeImporte('12,5.')).toBe('12,5');
  });

  it('descarta los decimales de más y las comas repetidas', () => {
    expect(formatearEntradaDeImporte('10,999')).toBe('10,99');
    expect(formatearEntradaDeImporte('10,,5')).toBe('10,5');
  });

  it('quita los ceros a la izquierda pero deja el cero de los centavos', () => {
    expect(formatearEntradaDeImporte('0005')).toBe('5');
    expect(formatearEntradaDeImporte('0')).toBe('0');
    expect(formatearEntradaDeImporte(',5')).toBe('0,5');
    expect(formatearEntradaDeImporte('00,5')).toBe('0,5');
  });

  it('descarta lo que no es un número', () => {
    expect(formatearEntradaDeImporte('$ 1a2-3')).toBe('123');
  });

  it('no deja pasar más de doce cifras enteras', () => {
    expect(formatearEntradaDeImporte('12345678901234')).toBe('123.456.789.012');
  });
});

describe('importeEscrito', () => {
  it('quita la coma final', () => {
    expect(importeEscrito('1.234,')).toBe('1.234');
  });

  it('deja igual un importe completo', () => {
    expect(importeEscrito('1.234,5')).toBe('1.234,5');
    expect(importeEscrito('')).toBe('');
  });
});
