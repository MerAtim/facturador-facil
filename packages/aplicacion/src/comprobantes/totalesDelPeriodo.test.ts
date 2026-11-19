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
  type Receptor,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { ComprobanteEmitido } from './comprobantesEmitidos';
import { formatearConSigno, totalesDelPeriodo } from './totalesDelPeriodo';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const hoy = valor(FechaCalendario.crear(2026, 11, 6));
const emisor = valor(
  Emisor.crear({
    razonSocial: 'Juana Pérez',
    cuit: valor(Cuit.crear('20111111112')),
    condicion: 'responsable_inscripto',
    domicilio: 'Mitre 100, Rosario',
    inicioDeActividades: valor(FechaCalendario.crear(2020, 1, 1)),
    puntoDeVenta: 3,
    ingresosBrutos: 'Exento',
  }),
);
const receptor: Receptor = {
  identificacion: { tipo: 'cuit', cuit: valor(Cuit.crear('30712345671')) },
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  nombre: 'Ferretería Sur',
  domicilio: 'Belgrano 123, Rosario',
};

/** Un comprobante de un solo ítem con precio neto, para que neto e IVA sean fáciles de seguir. */
function emitido(tipo: TipoComprobante, neto: string, numero = 1): ComprobanteEmitido {
  const preparado = valor(
    Comprobante.crear({
      tipo,
      receptor: receptor.condicion,
      identificacionReceptor: receptor.identificacion,
      modoDePrecio: 'neto',
      concepto: 'productos',
      items: [
        {
          descripcion: 'Tornillos',
          cantidad: Cantidad.UNO,
          precioUnitario: valor(Dinero.desdeTexto(neto)),
          alicuota: AlicuotaIva.VEINTIUNO,
        },
      ],
      fechaDeEmision: hoy,
      ...(tipo.naturaleza !== 'factura' && {
        asociado: {
          tipo: TipoComprobante.FACTURA_A,
          puntoDeVenta: 3,
          numero: 1,
          fechaDeEmision: hoy,
        },
      }),
    }),
  );
  return {
    ambiente: 'homologacion',
    emisor,
    puntoDeVenta: 3,
    numero,
    comprobante: valor(preparado.autorizar('76431234567890', hoy.sumarDias(10))),
    receptor,
  };
}

describe('totalesDelPeriodo', () => {
  it('sin comprobantes, todo da cero', () => {
    expect(totalesDelPeriodo([])).toEqual({
      cantidad: 0,
      totalEnCentavos: 0,
      netoEnCentavos: 0,
      ivaEnCentavos: 0,
    });
  });

  it('suma neto, IVA y total de las facturas', () => {
    const totales = totalesDelPeriodo([
      emitido(TipoComprobante.FACTURA_A, '1000', 1),
      emitido(TipoComprobante.FACTURA_A, '500', 2),
    ]);

    expect(totales).toEqual({
      cantidad: 2,
      netoEnCentavos: 150_000,
      ivaEnCentavos: 31_500,
      totalEnCentavos: 181_500,
    });
  });

  it('las notas de crédito restan y las de débito suman', () => {
    const totales = totalesDelPeriodo([
      emitido(TipoComprobante.FACTURA_A, '1000', 1),
      emitido(TipoComprobante.NOTA_DE_CREDITO_A, '200', 2),
      emitido(TipoComprobante.NOTA_DE_DEBITO_A, '100', 3),
    ]);

    expect(totales.cantidad).toBe(3);
    expect(totales.netoEnCentavos).toBe(90_000);
    expect(totales.totalEnCentavos).toBe(108_900);
  });

  it('si se acreditó más de lo facturado, el total da negativo', () => {
    const totales = totalesDelPeriodo([emitido(TipoComprobante.NOTA_DE_CREDITO_A, '100')]);

    expect(totales.totalEnCentavos).toBe(-12_100);
  });
});

describe('formatearConSigno', () => {
  it('formatea como importe, con el signo menos si es negativo', () => {
    expect(formatearConSigno(123_456)).toBe('$ 1.234,56');
    expect(formatearConSigno(-123_456)).toBe('−$ 1.234,56');
    expect(formatearConSigno(0)).toBe('$ 0,00');
  });
});
