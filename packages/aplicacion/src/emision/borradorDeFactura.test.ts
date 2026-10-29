import { AlicuotaIva, Cantidad, TipoComprobante, UnidadDeMedida } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import {
  cantidadDelBorrador,
  itemDelBorrador,
  itemVacio,
  subtotalDelBorrador,
  totalesDelBorrador,
  type BorradorDeItem,
} from './borradorDeFactura';

const item = (
  precio: string,
  cantidad = '',
  alicuota = AlicuotaIva.VEINTIUNO,
  descripcion = 'Servicio',
): BorradorDeItem => ({ descripcion, cantidad, unidad: UnidadDeMedida.UNIDADES, precio, alicuota });

describe('cantidadDelBorrador', () => {
  it('vacía vale uno', () => {
    expect(cantidadDelBorrador('')).toBe(Cantidad.UNO);
  });

  it('interpreta decimales, aunque la coma esté recién escrita', () => {
    expect((cantidadDelBorrador('2,5') as Cantidad).formatear()).toBe('2,5');
    expect((cantidadDelBorrador('2,') as Cantidad).formatear()).toBe('2');
  });

  it('informa una cantidad imposible', () => {
    expect(cantidadDelBorrador('0')).toEqual({ tipo: 'cantidad_invalida', motivo: 'no_positiva' });
  });
});

describe('itemDelBorrador', () => {
  it('arma el ítem con lo escrito', () => {
    const resultado = itemDelBorrador(item('1.234,5', '3', AlicuotaIva.DIEZ_Y_MEDIO, ' Flete '));

    expect(resultado.descripcion).toBe('Flete');
    expect(resultado.cantidad.formatear()).toBe('3');
    expect(resultado.precioUnitario.formatear()).toBe('$\u00a01.234,50');
    expect(resultado.alicuota).toBe(AlicuotaIva.DIEZ_Y_MEDIO);
    expect(resultado.unidad).toBe(UnidadDeMedida.UNIDADES);
  });

  it('lleva la unidad elegida', () => {
    const conLitros = { ...item('100', '2'), unidad: UnidadDeMedida.LITROS };

    expect(itemDelBorrador(conLitros).unidad).toBe(UnidadDeMedida.LITROS);
  });

  it('un ítem nuevo cuenta unidades', () => {
    expect(itemVacio(AlicuotaIva.VEINTIUNO).unidad).toBe(UnidadDeMedida.UNIDADES);
  });

  it('un precio vacío o a medio escribir cuenta como cero o como lo ya escrito', () => {
    expect(itemDelBorrador(item('')).precioUnitario.esCero()).toBe(true);
    expect(itemDelBorrador(item('1.234,')).precioUnitario.formatear()).toBe('$\u00a01.234,00');
  });
});

describe('subtotalDelBorrador', () => {
  it('multiplica precio por cantidad', () => {
    expect(subtotalDelBorrador(item('100', '2,5')).formatear()).toBe('$\u00a0250,00');
  });

  it('con una cantidad inválida no suma', () => {
    expect(subtotalDelBorrador(item('100', '0')).esCero()).toBe(true);
  });
});

describe('totalesDelBorrador', () => {
  it('agrupa por alícuota, con los mismos totales que el comprobante', () => {
    const totales = totalesDelBorrador(TipoComprobante.FACTURA_A, 'neto', [
      item('1.000', '2'),
      item('500', '', AlicuotaIva.DIEZ_Y_MEDIO),
      item('100'),
    ]);

    expect(
      totales.porAlicuota.map((g) => [
        g.alicuota.formatear(),
        g.neto.formatear(),
        g.iva.formatear(),
      ]),
    ).toEqual([
      ['21\u00a0%', '$\u00a02.100,00', '$\u00a0441,00'],
      ['10,5\u00a0%', '$\u00a0500,00', '$\u00a052,50'],
    ]);
    expect(totales.total.formatear()).toBe('$\u00a03.093,50');
  });

  it('deja afuera los ítems con cantidad inválida', () => {
    const totales = totalesDelBorrador(TipoComprobante.FACTURA_C, 'final', [
      item('100', '0'),
      item('50'),
    ]);

    expect(totales.total.formatear()).toBe('$\u00a050,00');
  });

  it('un ítem vacío no suma', () => {
    const totales = totalesDelBorrador(TipoComprobante.FACTURA_B, 'final', [
      itemVacio(AlicuotaIva.VEINTIUNO),
    ]);

    expect(totales.total.esCero()).toBe(true);
  });
});
