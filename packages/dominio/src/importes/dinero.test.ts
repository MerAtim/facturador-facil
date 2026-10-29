import { describe, expect, it } from 'vitest';

import { Dinero } from './dinero';

const pesos = (texto: string): Dinero => {
  const resultado = Dinero.desdeTexto(texto);
  if (!resultado.ok) throw new Error(`Importe de prueba inválido: ${texto}`);
  return resultado.valor;
};

describe('Dinero', () => {
  describe('desdeTexto', () => {
    it.each([
      ['0', 0],
      ['1234', 123400],
      ['1234,5', 123450],
      ['1234,56', 123456],
      ['1.234,56', 123456],
      ['1.234.567,89', 123456789],
      ['$ 1.234,56', 123456],
      // Lo que devuelve formatear, por ejemplo si se pega en un campo.
      ['$\u00a01.234,56', 123456],
      [' 0,01 ', 1],
    ])('interpreta %s como %i centavos', (texto, centavos) => {
      expect(pesos(texto).centavos).toBe(centavos);
    });

    it.each([
      ['', 'formato_invalido'],
      ['abc', 'formato_invalido'],
      ['-10', 'formato_invalido'],
      ['1234.56', 'formato_invalido'],
      ['12.34,5', 'formato_invalido'],
      ['1,2,3', 'formato_invalido'],
      ['1234,567', 'demasiados_decimales'],
      ['1,', 'formato_invalido'],
      ['1.23', 'formato_invalido'],
      ['1234.567', 'formato_invalido'],
      ['99999999999999999999', 'fuera_de_rango'],
      ['1'.repeat(31), 'fuera_de_rango'],
    ])('rechaza %s por %s', (texto, motivo) => {
      expect(Dinero.desdeTexto(texto)).toEqual({
        ok: false,
        error: { tipo: 'importe_invalido', motivo },
      });
    });
  });

  describe('desdeCentavos', () => {
    it.each([[-1], [1.5], [Number.MAX_SAFE_INTEGER + 1]])('rechaza %d', (centavos) => {
      expect(Dinero.desdeCentavos(centavos).ok).toBe(false);
    });
  });

  it('suma sin errores de punto flotante', () => {
    expect(pesos('0,1').sumar(pesos('0,2')).esIgualA(pesos('0,3'))).toBe(true);
  });

  it('resta mientras el resultado no sea negativo', () => {
    const resultado = pesos('10').restar(pesos('2,5'));

    expect(resultado.ok && resultado.valor.centavos).toBe(750);
    expect(pesos('1').restar(pesos('2')).ok).toBe(false);
  });

  describe('multiplicarPorFraccion', () => {
    it.each([
      ['100', 21, 100, 2100],
      ['0,05', 21, 100, 1],
      ['0,02', 21, 100, 0],
      ['10', 1, 3, 333],
      ['20', 1, 3, 667],
      ['0,01', 1, 2, 1],
    ])('%s × %i / %i = %i centavos', (importe, numerador, denominador, centavos) => {
      expect(pesos(importe).multiplicarPorFraccion(numerador, denominador).centavos).toBe(centavos);
    });

    it('no pierde precisión con importes grandes', () => {
      expect(pesos('90.000.000.000').multiplicarPorFraccion(2700, 10000).centavos).toBe(
        2_430_000_000_000,
      );
    });

    it.each([
      [1, 0],
      [-1, 1],
      [1.5, 2],
    ])('rechaza la fracción %d / %d', (numerador, denominador) => {
      expect(() => pesos('1').multiplicarPorFraccion(numerador, denominador)).toThrow(RangeError);
    });
  });

  it('indica si es cero', () => {
    expect(Dinero.CERO.esCero()).toBe(true);
    expect(pesos('0,01').esCero()).toBe(false);
  });

  it.each([
    ['0', '0.00', '$\u00a00,00'],
    ['0,05', '0.05', '$\u00a00,05'],
    ['1234,5', '1234.50', '$\u00a01.234,50'],
    ['1.234.567,89', '1234567.89', '$\u00a01.234.567,89'],
  ])('%s se envía a ARCA como %s y se muestra como %s', (texto, arca, pantalla) => {
    expect(pesos(texto).aTextoArca()).toBe(arca);
    expect(pesos(texto).formatear()).toBe(pantalla);
  });
});
