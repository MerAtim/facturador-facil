import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Emisor,
  FechaCalendario,
  TipoComprobante,
  type DatosComprobante,
  type ItemComprobante,
  type Receptor,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { ComprobanteEmitido } from '../comprobantes/comprobantesEmitidos';
import {
  prepararNotaDeCredito,
  type AlcanceDeLaNota,
  type PedidoDeNotaDeCredito,
} from './prepararNotaDeCredito';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const fecha = (anio: number, mes: number, dia: number) =>
  valor(FechaCalendario.crear(anio, mes, dia));
const hoy = fecha(2026, 10, 28);

const emisor = valor(
  Emisor.crear({
    razonSocial: 'Juana Pérez',
    cuit: valor(Cuit.crear('20111111112')),
    condicion: 'responsable_inscripto',
    domicilio: 'Mitre 100, Rosario',
    inicioDeActividades: fecha(2020, 1, 1),
    puntoDeVenta: 3,
  }),
);

const ferreteria: Receptor = {
  identificacion: { tipo: 'cuit', cuit: valor(Cuit.crear('30712345671')) },
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  nombre: 'Ferretería Sur',
};

const item = (descripcion: string, precio: string, alicuota?: AlicuotaIva): ItemComprobante => ({
  descripcion,
  cantidad: Cantidad.UNO,
  precioUnitario: valor(Dinero.desdeTexto(precio)),
  ...(alicuota && { alicuota }),
});

const emitido = (numero: number, datos: Partial<DatosComprobante> = {}): ComprobanteEmitido => {
  const comprobante = valor(
    Comprobante.crear({
      tipo: TipoComprobante.FACTURA_A,
      receptor: ferreteria.condicion,
      identificacionReceptor: ferreteria.identificacion,
      modoDePrecio: 'final',
      items: [item('Tornillos', '1.210', AlicuotaIva.VEINTIUNO)],
      fechaDeEmision: fecha(2026, 10, 20),
      concepto: 'productos',
      ...datos,
    }),
  );
  return {
    ambiente: 'homologacion',
    emisor,
    puntoDeVenta: 3,
    numero,
    comprobante: valor(comprobante.autorizar('76431234567890', fecha(2026, 10, 30))),
    receptor: ferreteria,
  };
};

const parcial = (importe: string, alicuota?: AlicuotaIva): AlcanceDeLaNota => ({
  tipo: 'parcial',
  importe,
  descripcion: 'Descuento por pronto pago',
  ...(alicuota && { alicuota }),
});

const preparar = (pedido: Partial<PedidoDeNotaDeCredito> = {}) =>
  prepararNotaDeCredito({
    factura: emitido(102),
    notasPrevias: [],
    alcance: { tipo: 'total' },
    hoy,
    ...pedido,
  });

const problema = (pedido: Partial<PedidoDeNotaDeCredito>) => {
  const resultado = preparar(pedido);
  return resultado.ok ? undefined : resultado.error;
};

describe('prepararNotaDeCredito', () => {
  it('la total repite la factura, al mismo receptor, e informa cuál ajusta', () => {
    const factura = emitido(102, {
      items: [
        item('Tornillos', '1.210', AlicuotaIva.VEINTIUNO),
        item('Flete', '552,50', AlicuotaIva.DIEZ_Y_MEDIO),
      ],
    });

    const { datos, totales } = valor(preparar({ factura }));

    expect(datos.tipo).toBe(TipoComprobante.NOTA_DE_CREDITO_A);
    expect(datos.items).toBe(factura.comprobante.datos.items);
    expect(totales).toEqual(factura.comprobante.totales);
    expect(datos.identificacionReceptor).toBe(ferreteria.identificacion);
    expect(datos.receptor).toBe(ferreteria.condicion);
    expect(datos.fechaDeEmision).toBe(hoy);
    expect(datos.asociado).toEqual({
      tipo: TipoComprobante.FACTURA_A,
      puntoDeVenta: 3,
      numero: 102,
      fechaDeEmision: fecha(2026, 10, 20),
    });
  });

  it('la parcial es un ítem con el importe, en la alícuota de la factura', () => {
    const { datos, totales } = valor(preparar({ alcance: parcial('121') }));

    expect(datos.items).toEqual([item('Descuento por pronto pago', '121', AlicuotaIva.VEINTIUNO)]);
    expect(datos.modoDePrecio).toBe('final');
    expect(totales.iva.formatear()).toBe('$ 21,00');
  });

  it('respeta el modo de precio de la factura', () => {
    const factura = emitido(102, { modoDePrecio: 'neto' });

    const { totales } = valor(preparar({ factura, alcance: parcial('100') }));

    expect(totales.total.formatear()).toBe('$ 121,00');
  });

  it('con varias alícuotas, la parcial tiene que elegir una de la factura', () => {
    const factura = emitido(102, {
      items: [
        item('Tornillos', '1.210', AlicuotaIva.VEINTIUNO),
        item('Libro', '1.105', AlicuotaIva.DIEZ_Y_MEDIO),
      ],
    });

    expect(problema({ factura, alcance: parcial('100') })).toEqual({ tipo: 'falta_alicuota' });
    expect(problema({ factura, alcance: parcial('100', AlicuotaIva.CINCO) })).toEqual({
      tipo: 'falta_alicuota',
    });
    const nota = valor(preparar({ factura, alcance: parcial('100', AlicuotaIva.DIEZ_Y_MEDIO) }));
    expect(nota.datos.items[0]?.alicuota).toBe(AlicuotaIva.DIEZ_Y_MEDIO);
  });

  it('en la clase C la parcial no lleva alícuota', () => {
    const factura = emitido(102, {
      tipo: TipoComprobante.FACTURA_C,
      receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
      items: [item('Clase de yoga', '5.000')],
    });

    const { datos } = valor(preparar({ factura, alcance: parcial('1.000') }));

    expect(datos.tipo).toBe(TipoComprobante.NOTA_DE_CREDITO_C);
    expect(datos.items).toEqual([item('Descuento por pronto pago', '1.000')]);
  });

  it.each(['', '0', '0,00', 'diez', '1,234'])('rechaza el importe %j', (importe) => {
    expect(problema({ alcance: parcial(importe) })).toEqual({ tipo: 'importe_invalido' });
  });

  it('pide una descripción', () => {
    expect(problema({ alcance: { tipo: 'parcial', importe: '100', descripcion: '   ' } })).toEqual({
      tipo: 'descripcion_vacia',
    });
  });

  it('no acredita más que la factura', () => {
    expect(problema({ alcance: parcial('1.210,01') })).toEqual({ tipo: 'supera_el_saldo' });
    expect(preparar({ alcance: parcial('1.210') }).ok).toBe(true);
  });

  it('descuenta lo que acreditaron las notas anteriores', () => {
    const factura = emitido(102);
    const previa = {
      ...factura,
      numero: 1,
      comprobante: valor(
        valor(preparar({ factura, alcance: parcial('1.000') })).autorizar(
          '76431234567891',
          fecha(2026, 11, 7),
        ),
      ),
    };

    expect(problema({ factura, notasPrevias: [previa], alcance: { tipo: 'total' } })).toEqual({
      tipo: 'supera_el_saldo',
    });
    expect(problema({ factura, notasPrevias: [previa], alcance: parcial('210,01') })).toEqual({
      tipo: 'supera_el_saldo',
    });
    expect(preparar({ factura, notasPrevias: [previa], alcance: parcial('210') }).ok).toBe(true);
  });

  it('no puede ser anterior a la factura', () => {
    expect(problema({ hoy: fecha(2026, 10, 19) })).toEqual({
      tipo: 'comprobante',
      motivo: 'anterior_al_asociado',
    });
  });

  describe('servicios', () => {
    const conServicios = (vencimientoDePago: FechaCalendario) =>
      emitido(102, {
        concepto: 'servicios',
        periodoDeServicio: {
          desde: fecha(2026, 10, 1),
          hasta: fecha(2026, 10, 15),
          vencimientoDePago,
        },
      });

    it('conserva el período y el vencimiento de pago si todavía no pasó', () => {
      const factura = conServicios(fecha(2026, 11, 10));

      const { datos } = valor(preparar({ factura }));

      expect(datos.concepto).toBe('servicios');
      expect(datos.periodoDeServicio).toEqual(factura.comprobante.datos.periodoDeServicio);
    });

    it('si el vencimiento ya pasó, vence el día de la nota', () => {
      const { datos } = valor(preparar({ factura: conServicios(fecha(2026, 10, 25)) }));

      expect(datos.periodoDeServicio).toEqual({
        desde: fecha(2026, 10, 1),
        hasta: fecha(2026, 10, 15),
        vencimientoDePago: hoy,
      });
    });
  });
});
