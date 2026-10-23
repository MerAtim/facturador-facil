import { describe, expect, it } from 'vitest';

import { CondicionIvaReceptor, claseParaEmitir } from './condicionIvaReceptor';
import { type CondicionEmisor } from './tipoComprobante';

const { RESPONSABLE_INSCRIPTO, MONOTRIBUTO, CONSUMIDOR_FINAL, EXENTO, MONOTRIBUTO_SOCIAL } =
  CondicionIvaReceptor;

describe('CondicionIvaReceptor', () => {
  it.each([1, 4, 5, 6, 7, 8, 9, 10, 13, 15, 16])('reconoce el código %i de ARCA', (codigo) => {
    expect(CondicionIvaReceptor.desdeCodigoArca(codigo)?.codigoArca).toBe(codigo);
  });

  it('no reconoce códigos inexistentes', () => {
    expect(CondicionIvaReceptor.desdeCodigoArca(2)).toBeUndefined();
  });

  it('solo inscriptos y monotributistas admiten factura A', () => {
    const admitenA = CondicionIvaReceptor.TODAS.filter((c) => c.admiteClase('A')).map(
      (c) => c.codigoArca,
    );

    expect(admitenA).toEqual([1, 6, 13, 16]);
  });

  it('nadie admite A y B a la vez, y todos admiten C', () => {
    for (const condicion of CondicionIvaReceptor.TODAS) {
      expect(condicion.admiteClase('A')).not.toBe(condicion.admiteClase('B'));
      expect(condicion.admiteClase('C')).toBe(true);
    }
  });
});

describe('claseParaEmitir', () => {
  it.each([
    ['responsable_inscripto', RESPONSABLE_INSCRIPTO, 'A'],
    ['responsable_inscripto', MONOTRIBUTO, 'A'],
    ['responsable_inscripto', MONOTRIBUTO_SOCIAL, 'A'],
    ['responsable_inscripto', CONSUMIDOR_FINAL, 'B'],
    ['responsable_inscripto', EXENTO, 'B'],
    ['monotributo', RESPONSABLE_INSCRIPTO, 'C'],
    ['monotributo', CONSUMIDOR_FINAL, 'C'],
    ['exento', RESPONSABLE_INSCRIPTO, 'C'],
  ] as const)('%s a %o emite %s', (emisor: CondicionEmisor, receptor, clase) => {
    expect(claseParaEmitir(emisor, receptor)).toBe(clase);
  });
});
