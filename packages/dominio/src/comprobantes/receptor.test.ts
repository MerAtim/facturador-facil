import { describe, expect, it } from 'vitest';

import { claseParaEmitir } from './condicionIvaReceptor';
import { CONSUMIDOR_FINAL_SIN_IDENTIFICAR } from './receptor';

describe('CONSUMIDOR_FINAL_SIN_IDENTIFICAR', () => {
  it('no se identifica ante ARCA', () => {
    expect(CONSUMIDOR_FINAL_SIN_IDENTIFICAR.identificacion.tipo).toBe('sin_identificar');
  });

  it('un responsable inscripto le emite factura B', () => {
    expect(
      claseParaEmitir('responsable_inscripto', CONSUMIDOR_FINAL_SIN_IDENTIFICAR.condicion),
    ).toBe('B');
  });
});
