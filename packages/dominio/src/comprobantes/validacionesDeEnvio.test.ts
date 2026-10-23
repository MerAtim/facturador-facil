import { describe, expect, it } from 'vitest';

import { FechaCalendario } from '../compartido/fechaCalendario';
import { Cuit } from '../contribuyente/cuit';
import { Dni } from '../contribuyente/dni';
import {
  SIN_IDENTIFICAR,
  type IdentificacionReceptor,
} from '../contribuyente/identificacionReceptor';
import { Cantidad } from '../importes/cantidad';
import { Dinero } from '../importes/dinero';
import { AlicuotaIva } from '../iva/alicuotaIva';
import { Comprobante, type DatosComprobante } from './comprobante';
import { CondicionIvaReceptor } from './condicionIvaReceptor';
import { TipoComprobante } from './tipoComprobante';
import { validarParaEnvio, type ContextoDeEnvio } from './validacionesDeEnvio';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const fecha = (anio: number, mes: number, dia: number) =>
  valor(FechaCalendario.crear(anio, mes, dia));
const hoy = fecha(2026, 10, 23);

const CON_CUIT: IdentificacionReceptor = {
  tipo: 'cuit',
  cuit: valor(Cuit.crear('20123456786')),
};
const CON_DNI: IdentificacionReceptor = { tipo: 'dni', dni: valor(Dni.crear('12.345.678')) };

const contexto: ContextoDeEnvio = {
  hoy,
  montoParaIdentificarConsumidorFinal: valor(Dinero.desdeTexto('10.000.000')),
};

const comprobante = (datos: Partial<DatosComprobante> = {}, total = '1.000'): Comprobante =>
  valor(
    Comprobante.crear({
      tipo: TipoComprobante.FACTURA_B,
      receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
      identificacionReceptor: SIN_IDENTIFICAR,
      modoDePrecio: 'final',
      items: [
        {
          descripcion: 'Producto',
          cantidad: Cantidad.UNO,
          precioUnitario: valor(Dinero.desdeTexto(total)),
          alicuota: AlicuotaIva.VEINTIUNO,
        },
      ],
      fechaDeEmision: hoy,
      concepto: 'productos',
      ...datos,
    }),
  );

const periodo = {
  desde: fecha(2026, 10, 1),
  hasta: fecha(2026, 10, 31),
  vencimientoDePago: fecha(2026, 11, 30),
};

describe('validarParaEnvio', () => {
  it('no encuentra problemas en una factura B chica a consumidor final', () => {
    expect(validarParaEnvio(comprobante(), contexto)).toEqual([]);
  });

  describe('fecha de emisión', () => {
    it.each([
      [-5, []],
      [5, []],
      [-6, ['fecha_de_emision_fuera_de_rango']],
      [6, ['fecha_de_emision_fuera_de_rango']],
    ])('productos con %i días de diferencia: %o', (dias, problemas) => {
      const datos = { fechaDeEmision: hoy.sumarDias(dias) };

      expect(validarParaEnvio(comprobante(datos), contexto)).toEqual(problemas);
    });

    it.each([
      [-10, []],
      [10, []],
      [-11, ['fecha_de_emision_fuera_de_rango']],
      [11, ['fecha_de_emision_fuera_de_rango']],
    ])('servicios con %i días de diferencia: %o', (dias, problemas) => {
      const datos = {
        concepto: 'servicios' as const,
        fechaDeEmision: hoy.sumarDias(dias),
        periodoDeServicio: periodo,
      };

      expect(validarParaEnvio(comprobante(datos), contexto)).toEqual(problemas);
    });
  });

  describe('identificación del receptor', () => {
    it.each([
      [
        'factura A sin CUIT',
        { tipo: TipoComprobante.FACTURA_A, receptor: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO },
      ],
      [
        'factura A con DNI',
        {
          tipo: TipoComprobante.FACTURA_A,
          receptor: CondicionIvaReceptor.MONOTRIBUTO,
          identificacionReceptor: CON_DNI,
        },
      ],
      ['factura B a un exento sin CUIT', { receptor: CondicionIvaReceptor.EXENTO }],
    ])('%s exige CUIT', (_, datos: Partial<DatosComprobante>) => {
      expect(validarParaEnvio(comprobante(datos), contexto)).toEqual(['falta_cuit_del_receptor']);
    });

    it('factura A con CUIT es válida', () => {
      const datos = {
        tipo: TipoComprobante.FACTURA_A,
        receptor: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
        identificacionReceptor: CON_CUIT,
      };

      expect(validarParaEnvio(comprobante(datos), contexto)).toEqual([]);
    });

    it.each([
      ['9.999.999,99', SIN_IDENTIFICAR, []],
      ['10.000.000', SIN_IDENTIFICAR, ['falta_identificar_consumidor_final']],
      ['10.000.000', CON_DNI, []],
      ['10.000.000', CON_CUIT, []],
    ] as const)(
      'consumidor final por %s identificado como %o: %o',
      (total, identificacionReceptor, problemas) => {
        const resultado = validarParaEnvio(
          comprobante({ identificacionReceptor }, total),
          contexto,
        );

        expect(resultado).toEqual(problemas);
      },
    );
  });

  it('informa todos los problemas juntos', () => {
    const datos = {
      tipo: TipoComprobante.FACTURA_A,
      receptor: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
      fechaDeEmision: hoy.sumarDias(-30),
    };

    expect(validarParaEnvio(comprobante(datos), contexto)).toEqual([
      'fecha_de_emision_fuera_de_rango',
      'falta_cuit_del_receptor',
    ]);
  });
});
