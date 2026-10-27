import { describe, expect, it } from 'vitest';

import { cuitCompleto, formatearEntradaDeCuit, soloDigitosDelCuit } from './entradaDeCuit';

describe('formatearEntradaDeCuit', () => {
  it.each([
    ['', ''],
    ['2', '2'],
    ['20', '20'],
    ['201', '20-1'],
    ['2012345678', '20-12345678'],
    ['20123456786', '20-12345678-6'],
  ])('"%s" se muestra "%s"', (escrito, mostrado) => {
    expect(formatearEntradaDeCuit(escrito)).toBe(mostrado);
  });

  it('al borrar el dígito que sigue a un guion, el guion se va con él', () => {
    expect(formatearEntradaDeCuit('20-12345678-')).toBe('20-12345678');
    expect(formatearEntradaDeCuit('20-')).toBe('20');
  });

  it('acepta un CUIT pegado con guiones o espacios', () => {
    expect(formatearEntradaDeCuit('20 12345678 6')).toBe('20-12345678-6');
    expect(formatearEntradaDeCuit('20-12345678-6')).toBe('20-12345678-6');
  });

  it('no pasa de once dígitos ni deja pasar otros caracteres', () => {
    expect(formatearEntradaDeCuit('2012345678699')).toBe('20-12345678-6');
    expect(formatearEntradaDeCuit('2a0.1')).toBe('20-1');
  });
});

describe('soloDigitosDelCuit y cuitCompleto', () => {
  it('quita el formato', () => {
    expect(soloDigitosDelCuit('20-12345678-6')).toBe('20123456786');
  });

  it('está completo con once dígitos', () => {
    expect(cuitCompleto('20-12345678-6')).toBe(true);
    expect(cuitCompleto('20-12345678')).toBe(false);
  });
});
