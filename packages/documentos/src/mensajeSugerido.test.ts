import { TipoComprobante } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { mensajeSugerido } from './mensajeSugerido';

describe('mensajeSugerido', () => {
  it('nombra la factura, el total y a quien la envía', () => {
    expect(
      mensajeSugerido({
        tipo: TipoComprobante.FACTURA_B,
        puntoDeVenta: 2,
        numero: 15,
        total: '$ 1.210,00',
        emisor: 'Juana Pérez',
      }),
    ).toBe('Hola, te envío la factura B 00002-00000015 por $ 1.210,00. ¡Gracias! Juana Pérez');
  });

  it('nombra la nota de crédito', () => {
    expect(
      mensajeSugerido({
        tipo: TipoComprobante.NOTA_DE_CREDITO_A,
        puntoDeVenta: 2,
        numero: 3,
        total: '$ 500,00',
        emisor: 'Juana Pérez',
      }),
    ).toBe(
      'Hola, te envío la nota de crédito A 00002-00000003 por $ 500,00. ¡Gracias! Juana Pérez',
    );
  });
});
