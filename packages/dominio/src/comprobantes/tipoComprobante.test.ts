import { describe, expect, it } from 'vitest';

import { TipoComprobante, clasesQuePuedeEmitir } from './tipoComprobante';

describe('TipoComprobante', () => {
  it.each([
    [1, 'A', 'factura'],
    [2, 'A', 'nota_de_debito'],
    [3, 'A', 'nota_de_credito'],
    [6, 'B', 'factura'],
    [7, 'B', 'nota_de_debito'],
    [8, 'B', 'nota_de_credito'],
    [11, 'C', 'factura'],
    [12, 'C', 'nota_de_debito'],
    [13, 'C', 'nota_de_credito'],
  ] as const)('el código %i de ARCA es %s de clase %s', (codigo, clase, naturaleza) => {
    expect(TipoComprobante.desdeCodigoArca(codigo)).toBe(TipoComprobante.de(clase, naturaleza));
  });

  it('no reconoce códigos que no soporta', () => {
    expect(TipoComprobante.desdeCodigoArca(51)).toBeUndefined();
  });

  it.each([
    [TipoComprobante.FACTURA_B, 'Factura B'],
    [TipoComprobante.NOTA_DE_CREDITO_A, 'Nota de crédito A'],
    [TipoComprobante.NOTA_DE_DEBITO_C, 'Nota de débito C'],
  ])('se imprime como %s', (tipo, descripcion) => {
    expect(tipo.descripcion).toBe(descripcion);
    expect(tipo.descripcion.startsWith(`${tipo.nombre} `)).toBe(true);
  });

  it.each([
    [TipoComprobante.FACTURA_A, true, true],
    [TipoComprobante.NOTA_DE_CREDITO_B, false, true],
    [TipoComprobante.FACTURA_C, false, false],
  ])('%o discrimina IVA: %s, informa IVA a ARCA: %s', (tipo, discrimina, informa) => {
    expect(tipo.discriminaIva()).toBe(discrimina);
    expect(tipo.informaIva()).toBe(informa);
  });
});

describe('clasesQuePuedeEmitir', () => {
  it.each([
    ['responsable_inscripto', ['A', 'B']],
    ['monotributo', ['C']],
    ['exento', ['C']],
  ] as const)('%s emite %o', (condicion, clases) => {
    expect(clasesQuePuedeEmitir(condicion)).toEqual(clases);
  });
});
