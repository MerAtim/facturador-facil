import { describe, expect, it } from 'vitest';

import { mensajeSugerido } from './mensajeSugerido';

describe('mensajeSugerido', () => {
  it('nombra la factura, el total y a quien la envía', () => {
    expect(
      mensajeSugerido({
        clase: 'B',
        puntoDeVenta: 2,
        numero: 15,
        total: '$ 1.210,00',
        emisor: 'Juana Pérez',
      }),
    ).toBe('Hola, te envío la factura B 00002-00000015 por $ 1.210,00. ¡Gracias! Juana Pérez');
  });
});
