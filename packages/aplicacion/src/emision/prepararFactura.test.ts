import {
  AlicuotaIva,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  CondicionIvaReceptor,
  Cuit,
  FechaCalendario,
  TipoComprobante,
  type Receptor,
  UnidadDeMedida,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { BorradorDeItem } from './borradorDeFactura';
import { prepararFactura, type BorradorDeFactura } from './prepararFactura';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const hoy = valor(FechaCalendario.crear(2026, 10, 27));

const item = (precio: string, descripcion = 'Tornillos', cantidad = ''): BorradorDeItem => ({
  descripcion,
  cantidad,
  unidad: UnidadDeMedida.UNIDADES,
  precio,
  alicuota: AlicuotaIva.VEINTIUNO,
});

const responsableInscripto: Receptor = {
  identificacion: { tipo: 'cuit', cuit: valor(Cuit.crear('30712345671')) },
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
};

const facturaB = (items: readonly BorradorDeItem[]): BorradorDeFactura => ({
  tipo: TipoComprobante.FACTURA_B,
  receptor: CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  modoDePrecio: 'final',
  items,
  hoy,
});

const problemas = (borrador: BorradorDeFactura) => {
  const resultado = prepararFactura(borrador);
  return resultado.ok ? [] : resultado.error;
};

describe('prepararFactura', () => {
  it('arma el comprobante con lo cargado', () => {
    const comprobante = valor(prepararFactura(facturaB([item('1.210', 'Tornillos', '2')])));

    expect(comprobante.totales.total.formatear()).toBe('$\u00a02.420,00');
    expect(comprobante.datos.fechaDeEmision).toBe(hoy);
    expect(comprobante.datos.concepto).toBe('productos');
    expect(comprobante.datos.identificacionReceptor.tipo).toBe('sin_identificar');
  });

  it('informa los problemas de todos los ítems juntos', () => {
    expect(problemas(facturaB([item('100', '  '), item('', 'Flete', '0')]))).toEqual([
      { tipo: 'item_sin_descripcion', item: 1 },
      { tipo: 'item_con_cantidad_invalida', item: 2 },
      { tipo: 'item_sin_precio', item: 2 },
    ]);
  });

  it('una factura A exige el CUIT del receptor', () => {
    expect(
      problemas({
        ...facturaB([item('100')]),
        tipo: TipoComprobante.FACTURA_A,
        receptor: {
          identificacion: { tipo: 'sin_identificar' },
          condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
          domicilio: 'Belgrano 123',
        },
      }),
    ).toEqual([{ tipo: 'envio', problema: 'falta_cuit_del_receptor' }]);
  });

  it('una factura A exige el domicilio del receptor, porque lo imprime', () => {
    const facturaA = {
      ...facturaB([item('100')]),
      tipo: TipoComprobante.FACTURA_A,
      receptor: responsableInscripto,
    };

    expect(problemas(facturaA)).toEqual([{ tipo: 'receptor_sin_domicilio' }]);
    expect(
      problemas({ ...facturaA, receptor: { ...responsableInscripto, domicilio: '  ' } }),
    ).toEqual([{ tipo: 'receptor_sin_domicilio' }]);
    expect(
      problemas({ ...facturaA, receptor: { ...responsableInscripto, domicilio: 'Belgrano 123' } }),
    ).toEqual([]);
  });

  it('desde $ 10.000.000 hay que identificar al consumidor final', () => {
    expect(problemas(facturaB([item('9.999.999,99')]))).toEqual([]);
    expect(problemas(facturaB([item('10.000.000')]))).toEqual([
      { tipo: 'envio', problema: 'falta_identificar_consumidor_final' },
    ]);
  });

  it('informa si el receptor no admite la clase del comprobante', () => {
    expect(problemas({ ...facturaB([item('100')]), receptor: responsableInscripto })).toEqual([
      { tipo: 'comprobante', motivo: 'receptor_no_admite_clase' },
    ]);
  });
});
