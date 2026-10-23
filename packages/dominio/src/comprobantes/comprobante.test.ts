import { describe, expect, it } from 'vitest';

import { Cantidad } from '../importes/cantidad';
import { Dinero } from '../importes/dinero';
import { AlicuotaIva } from '../iva/alicuotaIva';
import { Comprobante, type DatosComprobante, type ItemComprobante } from './comprobante';
import { CondicionIvaReceptor } from './condicionIvaReceptor';
import { TipoComprobante } from './tipoComprobante';

const pesos = (texto: string): Dinero => {
  const resultado = Dinero.desdeTexto(texto);
  if (!resultado.ok) throw new Error(`Importe de prueba inválido: ${texto}`);
  return resultado.valor;
};

const cantidad = (texto: string): Cantidad => {
  const resultado = Cantidad.desdeTexto(texto);
  if (!resultado.ok) throw new Error(`Cantidad de prueba inválida: ${texto}`);
  return resultado.valor;
};

const item = (
  precio: string,
  alicuota?: AlicuotaIva,
  unidades = '1',
  descripcion = 'Servicio',
): ItemComprobante => ({
  descripcion,
  cantidad: cantidad(unidades),
  precioUnitario: pesos(precio),
  ...(alicuota ? { alicuota } : {}),
});

const facturaA = (items: readonly ItemComprobante[]): DatosComprobante => ({
  tipo: TipoComprobante.FACTURA_A,
  receptor: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  modoDePrecio: 'final',
  items,
});

const crear = (datos: DatosComprobante): Comprobante => {
  const resultado = Comprobante.crear(datos);
  if (!resultado.ok) throw new Error(`Comprobante de prueba inválido: ${resultado.error.motivo}`);
  return resultado.valor;
};

const enPesos = (dinero: Dinero) => dinero.formatear();

describe('Comprobante', () => {
  describe('totales', () => {
    it('agrupa por alícuota y calcula desde el precio final', () => {
      const { totales } = crear(
        facturaA([
          item('100', AlicuotaIva.VEINTIUNO, '2'),
          item('50', AlicuotaIva.VEINTIUNO),
          item('1.105', AlicuotaIva.DIEZ_Y_MEDIO),
        ]),
      );

      expect(totales.porAlicuota.map((g) => [g.alicuota, enPesos(g.neto), enPesos(g.iva)])).toEqual(
        [
          [AlicuotaIva.VEINTIUNO, '$ 206,61', '$ 43,39'],
          [AlicuotaIva.DIEZ_Y_MEDIO, '$ 1.000,00', '$ 105,00'],
        ],
      );
      expect(enPesos(totales.neto)).toBe('$ 1.206,61');
      expect(enPesos(totales.iva)).toBe('$ 148,39');
      expect(enPesos(totales.total)).toBe('$ 1.355,00');
    });

    it('calcula desde el precio neto', () => {
      const { totales } = crear({
        ...facturaA([item('1.000', AlicuotaIva.VEINTIUNO)]),
        modoDePrecio: 'neto',
      });

      expect(enPesos(totales.iva)).toBe('$ 210,00');
      expect(enPesos(totales.total)).toBe('$ 1.210,00');
    });

    it('multiplica por cantidades con decimales', () => {
      const { totales } = crear(facturaA([item('100', AlicuotaIva.VEINTIUNO, '2,5')]));

      expect(enPesos(totales.total)).toBe('$ 250,00');
    });

    it('la factura B informa neto e IVA aunque no los discrimine', () => {
      const { totales } = crear({
        ...facturaA([item('1.210', AlicuotaIva.VEINTIUNO)]),
        tipo: TipoComprobante.FACTURA_B,
        receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
      });

      expect(enPesos(totales.neto)).toBe('$ 1.000,00');
      expect(enPesos(totales.iva)).toBe('$ 210,00');
    });

    it('la factura C no lleva IVA ni necesita alícuota', () => {
      const { totales } = crear({
        tipo: TipoComprobante.FACTURA_C,
        receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
        modoDePrecio: 'final',
        items: [item('100', undefined, '3'), item('50')],
      });

      expect(enPesos(totales.total)).toBe('$ 350,00');
      expect(enPesos(totales.neto)).toBe('$ 350,00');
      expect(totales.iva.esCero()).toBe(true);
      expect(totales.porAlicuota).toEqual([]);
    });
  });

  describe('validaciones', () => {
    it.each([
      ['sin_items', facturaA([])],
      ['descripcion_vacia', facturaA([item('100', AlicuotaIva.VEINTIUNO, '1', '  ')])],
      ['falta_alicuota', facturaA([item('100')])],
      [
        'receptor_no_admite_clase',
        {
          ...facturaA([item('100', AlicuotaIva.VEINTIUNO)]),
          receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
        },
      ],
      [
        'receptor_no_admite_clase',
        { ...facturaA([item('100', AlicuotaIva.VEINTIUNO)]), tipo: TipoComprobante.FACTURA_B },
      ],
    ] as const)('rechaza por %s', (motivo, datos) => {
      expect(Comprobante.crear(datos)).toEqual({
        ok: false,
        error: { tipo: 'comprobante_invalido', motivo },
      });
    });
  });

  describe('autorización', () => {
    const vencimiento = new Date('2026-11-02T00:00:00-03:00');

    it('registra el CAE sin modificar el comprobante original', () => {
      const borrador = crear(facturaA([item('100', AlicuotaIva.VEINTIUNO)]));

      const resultado = borrador.autorizar('75123456789012', vencimiento);

      expect(resultado.ok && resultado.valor.autorizacion).toEqual({
        cae: '75123456789012',
        vencimiento,
      });
      expect(borrador.estaAutorizado()).toBe(false);
    });

    it('no se autoriza dos veces', () => {
      const borrador = crear(facturaA([item('100', AlicuotaIva.VEINTIUNO)]));
      const autorizado = borrador.autorizar('75123456789012', vencimiento);

      expect(autorizado.ok && autorizado.valor.autorizar('75123456789013', vencimiento)).toEqual({
        ok: false,
        error: { tipo: 'comprobante_invalido', motivo: 'ya_autorizado' },
      });
    });

    it.each(['', '123', '7512345678901a', '751234567890123'])('rechaza el CAE %s', (cae) => {
      const borrador = crear(facturaA([item('100', AlicuotaIva.VEINTIUNO)]));

      expect(borrador.autorizar(cae, vencimiento).ok).toBe(false);
    });
  });
});
