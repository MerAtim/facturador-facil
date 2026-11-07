import { FechaCalendario } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { ajustarAlRango, rangoDeFechaDeEmision } from './rangoDeFecha';

const fecha = (anio: number, mes: number, dia: number) => {
  const resultado = FechaCalendario.crear(anio, mes, dia);
  if (!resultado.ok) throw new Error('Fecha de prueba inválida');
  return resultado.valor;
};
const hoy = fecha(2026, 11, 7);
const texto = (f: FechaCalendario) => f.formatear();

describe('rangoDeFechaDeEmision', () => {
  it('sin comprobantes previos, va desde 5 días atrás hasta hoy para productos', () => {
    const rango = rangoDeFechaDeEmision({ hoy, concepto: 'productos' });

    expect(rango.tipo).toBe('rango');
    if (rango.tipo !== 'rango') return;
    expect(texto(rango.desde)).toBe('02/11/2026');
    expect(texto(rango.hasta)).toBe('07/11/2026');
    expect(rango.limite).toBe('margen');
    expect(rango.diasDeMargen).toBe(5);
  });

  it('con servicios, el margen es de 10 días', () => {
    const rango = rangoDeFechaDeEmision({ hoy, concepto: 'servicios' });

    expect(rango.tipo === 'rango' && texto(rango.desde)).toBe('28/10/2026');
  });

  it('un último comprobante más viejo que el margen no cambia nada', () => {
    const rango = rangoDeFechaDeEmision({
      hoy,
      concepto: 'productos',
      ultimaFecha: fecha(2026, 10, 20),
    });

    expect(rango.tipo === 'rango' && rango.limite).toBe('margen');
  });

  it('un último comprobante dentro del margen fija el comienzo', () => {
    const rango = rangoDeFechaDeEmision({
      hoy,
      concepto: 'productos',
      ultimaFecha: fecha(2026, 11, 5),
    });

    expect(rango.tipo).toBe('rango');
    if (rango.tipo !== 'rango') return;
    expect(texto(rango.desde)).toBe('05/11/2026');
    expect(rango.limite).toBe('ultimo_comprobante');
  });

  it('un último comprobante de hoy deja solo la fecha de hoy', () => {
    const rango = rangoDeFechaDeEmision({ hoy, concepto: 'productos', ultimaFecha: hoy });

    expect(rango.tipo === 'rango' && texto(rango.desde)).toBe('07/11/2026');
  });

  it('un último comprobante con fecha posterior a hoy no deja ninguna fecha', () => {
    const rango = rangoDeFechaDeEmision({
      hoy,
      concepto: 'productos',
      ultimaFecha: fecha(2026, 11, 9),
    });

    expect(rango).toEqual({ tipo: 'sin_fecha_valida', desde: fecha(2026, 11, 9) });
  });
});

describe('ajustarAlRango', () => {
  const rango = rangoDeFechaDeEmision({
    hoy,
    concepto: 'productos',
    ultimaFecha: fecha(2026, 11, 5),
  });

  it('deja la fecha si está dentro del rango', () => {
    expect(texto(ajustarAlRango(fecha(2026, 11, 6), rango))).toBe('06/11/2026');
  });

  it('lleva una fecha anterior al comienzo del rango', () => {
    expect(texto(ajustarAlRango(fecha(2026, 11, 3), rango))).toBe('05/11/2026');
  });

  it('lleva una fecha futura a hoy', () => {
    expect(texto(ajustarAlRango(fecha(2026, 11, 10), rango))).toBe('07/11/2026');
  });
});
