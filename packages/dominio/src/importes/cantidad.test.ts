import { describe, expect, it } from 'vitest';

import { Cantidad } from './cantidad';

describe('Cantidad', () => {
  it.each([
    ['1', 1000, '1'],
    ['2,5', 2500, '2,5'],
    ['0,125', 125, '0,125'],
    [' 10 ', 10000, '10'],
    ['1,500', 1500, '1,5'],
  ])('interpreta %s', (texto, milesimas, formateada) => {
    const resultado = Cantidad.desdeTexto(texto);

    expect(resultado.ok && resultado.valor.milesimas).toBe(milesimas);
    expect(resultado.ok && resultado.valor.formatear()).toBe(formateada);
  });

  it.each([
    ['', 'formato_invalido'],
    ['abc', 'formato_invalido'],
    ['-1', 'formato_invalido'],
    ['1.5', 'formato_invalido'],
    ['1,', 'formato_invalido'],
    ['1,2,3', 'formato_invalido'],
    ['1'.repeat(16), 'formato_invalido'],
    ['1,2345', 'demasiados_decimales'],
    ['0', 'no_positiva'],
    ['0,000', 'no_positiva'],
  ])('rechaza %s por %s', (texto, motivo) => {
    expect(Cantidad.desdeTexto(texto)).toEqual({
      ok: false,
      error: { tipo: 'cantidad_invalida', motivo },
    });
  });

  it('se rearma desde las milésimas guardadas', () => {
    const cantidad = Cantidad.desdeMilesimas(2500);

    expect(cantidad.ok && cantidad.valor.formatear()).toBe('2,5');
  });

  it.each([
    [0, 'no_positiva'],
    [-1000, 'no_positiva'],
    [1.5, 'formato_invalido'],
    [Number.NaN, 'formato_invalido'],
  ])('no rearma %s milésimas: %s', (milesimas, motivo) => {
    expect(Cantidad.desdeMilesimas(milesimas)).toEqual({
      ok: false,
      error: { tipo: 'cantidad_invalida', motivo },
    });
  });

  it('se expresa como fracción en milésimas', () => {
    expect(Cantidad.UNO.comoFraccion()).toEqual([1000, 1000]);
  });
});
