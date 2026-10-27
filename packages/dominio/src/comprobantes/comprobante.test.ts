import { describe, expect, it } from 'vitest';

import { FechaCalendario } from '../compartido/fechaCalendario';
import { SIN_IDENTIFICAR } from '../contribuyente/identificacionReceptor';
import { Cantidad } from '../importes/cantidad';
import { Dinero } from '../importes/dinero';
import { AlicuotaIva } from '../iva/alicuotaIva';
import {
  calcularTotales,
  Comprobante,
  type DatosComprobante,
  type ItemComprobante,
} from './comprobante';
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

const fecha = (anio: number, mes: number, dia: number): FechaCalendario => {
  const resultado = FechaCalendario.crear(anio, mes, dia);
  if (!resultado.ok) throw new Error('Fecha de prueba inválida');
  return resultado.valor;
};

const hoy = fecha(2026, 10, 23);

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
  identificacionReceptor: SIN_IDENTIFICAR,
  modoDePrecio: 'final',
  items,
  fechaDeEmision: hoy,
  concepto: 'productos',
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
        identificacionReceptor: SIN_IDENTIFICAR,
        modoDePrecio: 'final',
        items: [item('100', undefined, '3'), item('50')],
        fechaDeEmision: hoy,
        concepto: 'productos',
      });

      expect(enPesos(totales.total)).toBe('$ 350,00');
      expect(enPesos(totales.neto)).toBe('$ 350,00');
      expect(totales.iva.esCero()).toBe(true);
      expect(totales.porAlicuota).toEqual([]);
    });

    it('calcularTotales da lo mismo que el comprobante creado', () => {
      const datos = facturaA([
        item('1.355', AlicuotaIva.VEINTIUNO),
        item('99,99', AlicuotaIva.CINCO),
      ]);

      expect(calcularTotales(datos)).toEqual(crear(datos).totales);
    });

    it('calcularTotales funciona mientras el comprobante todavía está incompleto', () => {
      const totales = calcularTotales({
        tipo: TipoComprobante.FACTURA_B,
        modoDePrecio: 'final',
        items: [item('0', AlicuotaIva.VEINTIUNO, '1', '')],
      });

      expect(totales.total.esCero()).toBe(true);
      expect(totales.iva.esCero()).toBe(true);
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

  describe('servicios', () => {
    const periodo = {
      desde: fecha(2026, 10, 1),
      hasta: fecha(2026, 10, 31),
      vencimientoDePago: fecha(2026, 11, 10),
    };
    const servicios = (datos: Partial<DatosComprobante>): DatosComprobante => ({
      ...facturaA([item('100', AlicuotaIva.VEINTIUNO)]),
      concepto: 'servicios',
      periodoDeServicio: periodo,
      ...datos,
    });

    it('acepta un período válido', () => {
      expect(Comprobante.crear(servicios({})).ok).toBe(true);
    });

    it('acepta un vencimiento de pago igual a la fecha de emisión', () => {
      const datos = servicios({ periodoDeServicio: { ...periodo, vencimientoDePago: hoy } });

      expect(Comprobante.crear(datos).ok).toBe(true);
    });

    it.each([
      [
        'falta_periodo_de_servicio',
        { concepto: 'productos_y_servicios', periodoDeServicio: undefined },
      ],
      ['periodo_de_servicio_no_corresponde', { concepto: 'productos' }],
      [
        'periodo_de_servicio_invertido',
        { periodoDeServicio: { ...periodo, desde: fecha(2026, 11, 1) } },
      ],
      [
        'vencimiento_de_pago_anterior_a_emision',
        { periodoDeServicio: { ...periodo, vencimientoDePago: fecha(2026, 10, 22) } },
      ],
    ] as const)('rechaza por %s', (motivo, cambios) => {
      const { periodoDeServicio, ...resto } = servicios(cambios as Partial<DatosComprobante>);
      const datos = periodoDeServicio ? { ...resto, periodoDeServicio } : resto;

      expect(Comprobante.crear(datos)).toEqual({
        ok: false,
        error: { tipo: 'comprobante_invalido', motivo },
      });
    });
  });

  describe('autorización', () => {
    const vencimiento = fecha(2026, 11, 2);

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
