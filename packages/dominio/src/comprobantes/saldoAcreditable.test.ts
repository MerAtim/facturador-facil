import { describe, expect, it } from 'vitest';

import { FechaCalendario } from '../compartido/fechaCalendario';
import { SIN_IDENTIFICAR } from '../contribuyente/identificacionReceptor';
import { Cantidad } from '../importes/cantidad';
import { Dinero } from '../importes/dinero';
import { AlicuotaIva } from '../iva/alicuotaIva';
import { Comprobante, type ItemComprobante } from './comprobante';
import { CondicionIvaReceptor } from './condicionIvaReceptor';
import { excedeElSaldo, saldoAcreditable } from './saldoAcreditable';
import { TipoComprobante } from './tipoComprobante';

const pesos = (texto: string): Dinero => {
  const resultado = Dinero.desdeTexto(texto);
  if (!resultado.ok) throw new Error(`Importe de prueba inválido: ${texto}`);
  return resultado.valor;
};

const hoy = (() => {
  const resultado = FechaCalendario.crear(2026, 10, 28);
  if (!resultado.ok) throw new Error('Fecha de prueba inválida');
  return resultado.valor;
})();

const item = (precio: string, alicuota?: AlicuotaIva): ItemComprobante => {
  const cantidad = Cantidad.desdeTexto('1');
  if (!cantidad.ok) throw new Error('Cantidad de prueba inválida');
  return {
    descripcion: 'Ítem',
    cantidad: cantidad.valor,
    precioUnitario: pesos(precio),
    ...(alicuota && { alicuota }),
  };
};

const comprobante = (tipo: TipoComprobante, items: readonly ItemComprobante[]): Comprobante => {
  const resultado = Comprobante.crear({
    tipo,
    receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
    identificacionReceptor: SIN_IDENTIFICAR,
    modoDePrecio: 'final',
    items,
    fechaDeEmision: hoy,
    concepto: 'productos',
    ...(tipo.naturaleza !== 'factura' && {
      asociado: {
        tipo: TipoComprobante.de(tipo.clase, 'factura'),
        puntoDeVenta: 1,
        numero: 1,
        fechaDeEmision: hoy,
      },
    }),
  });
  if (!resultado.ok) throw new Error(`Comprobante de prueba inválido: ${resultado.error.motivo}`);
  return resultado.valor;
};

const facturaB = comprobante(TipoComprobante.FACTURA_B, [
  item('12.100', AlicuotaIva.VEINTIUNO),
  item('1.105', AlicuotaIva.DIEZ_Y_MEDIO),
]);
const notaB = (...items: ItemComprobante[]) =>
  comprobante(TipoComprobante.NOTA_DE_CREDITO_B, items);

const enPesos = ({ total, porAlicuota }: ReturnType<typeof saldoAcreditable>) => ({
  total: total.formatear(),
  porAlicuota: porAlicuota.map(({ alicuota, importe }) => [alicuota, importe.formatear()]),
});

describe('saldoAcreditable', () => {
  it('sin notas, es la factura entera', () => {
    expect(enPesos(saldoAcreditable(facturaB, []))).toEqual({
      total: '$ 13.205,00',
      porAlicuota: [
        [AlicuotaIva.VEINTIUNO, '$ 12.100,00'],
        [AlicuotaIva.DIEZ_Y_MEDIO, '$ 1.105,00'],
      ],
    });
  });

  it('descuenta cada nota de su alícuota', () => {
    const saldo = saldoAcreditable(facturaB, [
      notaB(item('2.000', AlicuotaIva.VEINTIUNO)),
      notaB(item('100', AlicuotaIva.VEINTIUNO), item('105', AlicuotaIva.DIEZ_Y_MEDIO)),
    ]);

    expect(enPesos(saldo)).toEqual({
      total: '$ 11.000,00',
      porAlicuota: [
        [AlicuotaIva.VEINTIUNO, '$ 10.000,00'],
        [AlicuotaIva.DIEZ_Y_MEDIO, '$ 1.000,00'],
      ],
    });
  });

  it('nunca queda negativo', () => {
    const saldo = saldoAcreditable(facturaB, [
      notaB(item('12.100', AlicuotaIva.VEINTIUNO), item('1.105', AlicuotaIva.DIEZ_Y_MEDIO)),
      notaB(item('50', AlicuotaIva.VEINTIUNO)),
    ]);

    expect(saldo.total.esCero()).toBe(true);
    expect(saldo.porAlicuota.every(({ importe }) => importe.esCero())).toBe(true);
  });

  it('en la clase C solo lleva el total', () => {
    const facturaC = comprobante(TipoComprobante.FACTURA_C, [item('5.000')]);
    const notaC = comprobante(TipoComprobante.NOTA_DE_CREDITO_C, [item('1.500')]);

    expect(enPesos(saldoAcreditable(facturaC, [notaC]))).toEqual({
      total: '$ 3.500,00',
      porAlicuota: [],
    });
  });
});

describe('excedeElSaldo', () => {
  const saldo = saldoAcreditable(facturaB, []);

  it('la factura entera cabe justo', () => {
    const total = notaB(
      item('12.100', AlicuotaIva.VEINTIUNO),
      item('1.105', AlicuotaIva.DIEZ_Y_MEDIO),
    );

    expect(excedeElSaldo(total, saldo)).toBe(false);
  });

  it('no puede superar el total', () => {
    expect(excedeElSaldo(notaB(item('13.205,01', AlicuotaIva.VEINTIUNO)), saldo)).toBe(true);
  });

  it('no puede superar lo que queda de una alícuota aunque el total alcance', () => {
    expect(excedeElSaldo(notaB(item('1.105,01', AlicuotaIva.DIEZ_Y_MEDIO)), saldo)).toBe(true);
  });

  it('no puede acreditar una alícuota que la factura no tiene', () => {
    expect(excedeElSaldo(notaB(item('100', AlicuotaIva.VEINTISIETE)), saldo)).toBe(true);
  });
});
