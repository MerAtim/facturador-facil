import { describe, expect, it } from 'vitest';

import { FechaCalendario } from '../compartido/fechaCalendario';
import { Cuit } from './cuit';
import { Emisor, validarDatosDelEmisor, type DatosEmisor } from './emisor';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const datos: DatosEmisor = {
  razonSocial: 'Juana Pérez',
  cuit: valor(Cuit.crear('27333333339')),
  condicion: 'monotributo',
  domicilio: 'Av. Siempreviva 742, Rosario',
  inicioDeActividades: valor(FechaCalendario.crear(1998, 3, 1)),
  puntoDeVenta: 2,
};

describe('Emisor', () => {
  it('se crea con datos válidos', () => {
    const emisor = valor(Emisor.crear(datos));

    expect(emisor.datos.razonSocial).toBe('Juana Pérez');
    expect(emisor.datos.puntoDeVenta).toBe(2);
  });

  it('limpia espacios de más y caracteres de control', () => {
    const emisor = valor(
      Emisor.crear({ ...datos, razonSocial: '  Juana \u0007 Pérez ', domicilio: 'Calle\n123' }),
    );

    expect(emisor.datos.razonSocial).toBe('Juana Pérez');
    expect(emisor.datos.domicilio).toBe('Calle 123');
  });

  it('informa todos los problemas juntos', () => {
    const resultado = Emisor.crear({ ...datos, razonSocial: '  ', domicilio: '', puntoDeVenta: 0 });

    expect(resultado).toEqual({
      ok: false,
      error: {
        tipo: 'emisor_invalido',
        motivos: ['razon_social_vacia', 'domicilio_vacio', 'punto_de_venta_invalido'],
      },
    });
  });

  it('rechaza textos demasiado largos', () => {
    const resultado = Emisor.crear({
      ...datos,
      razonSocial: 'x'.repeat(101),
      domicilio: 'y'.repeat(151),
    });

    expect(resultado.ok ? [] : resultado.error.motivos).toEqual([
      'razon_social_larga',
      'domicilio_largo',
    ]);
  });

  it.each([0, 100_000, 1.5, Number.NaN])('rechaza el punto de venta %d', (puntoDeVenta) => {
    expect(Emisor.crear({ ...datos, puntoDeVenta }).ok).toBe(false);
  });

  it.each([1, 99_999])('acepta el punto de venta %d', (puntoDeVenta) => {
    expect(Emisor.crear({ ...datos, puntoDeVenta }).ok).toBe(true);
  });

  it('validarDatosDelEmisor revisa los datos escritos sin necesitar CUIT ni fecha', () => {
    expect(
      validarDatosDelEmisor({ razonSocial: 'Juana', domicilio: ' ', puntoDeVenta: 3 }),
    ).toEqual(['domicilio_vacio']);
  });

  describe('Ingresos Brutos', () => {
    it.each(['901-123456-7', 'Exento', 'Convenio Multilateral 901-123456-7', '20123456786'])(
      'acepta "%s"',
      (ingresosBrutos) => {
        expect(valor(Emisor.crear({ ...datos, ingresosBrutos })).datos.ingresosBrutos).toBe(
          ingresosBrutos,
        );
      },
    );

    it('es opcional, para las configuraciones guardadas antes de pedirlo', () => {
      expect(valor(Emisor.crear(datos)).datos).not.toHaveProperty('ingresosBrutos');
    });

    it.each(['', '   ', '<script>', 'x'.repeat(41)])('rechaza "%s"', (ingresosBrutos) => {
      expect(validarDatosDelEmisor({ ...datos, ingresosBrutos })).toEqual([
        'ingresos_brutos_invalido',
      ]);
    });
  });
});
