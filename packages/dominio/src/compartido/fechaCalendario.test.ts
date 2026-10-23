import { describe, expect, it } from 'vitest';

import { FechaCalendario } from './fechaCalendario';

const fecha = (anio: number, mes: number, dia: number): FechaCalendario => {
  const resultado = FechaCalendario.crear(anio, mes, dia);
  if (!resultado.ok) throw new Error('Fecha de prueba inválida');
  return resultado.valor;
};

describe('FechaCalendario', () => {
  describe('enArgentina', () => {
    it.each([
      ['2026-10-24T02:30:00Z', '23/10/2026'],
      ['2026-10-24T02:59:59Z', '23/10/2026'],
      ['2026-10-24T03:00:00Z', '24/10/2026'],
      ['2026-10-23T12:00:00Z', '23/10/2026'],
      ['2027-01-01T02:00:00Z', '31/12/2026'],
      ['2028-03-01T01:00:00Z', '29/02/2028'],
    ])('el instante %s es el %s en Argentina', (instante, esperado) => {
      expect(FechaCalendario.enArgentina(new Date(instante)).formatear()).toBe(esperado);
    });
  });

  it.each([
    [2026, 2, 29],
    [2026, 13, 1],
    [2026, 4, 31],
    [2026, 0, 10],
    [1999, 12, 31],
    [2026.5, 1, 1],
  ])('rechaza %i/%i/%i', (anio, mes, dia) => {
    expect(FechaCalendario.crear(anio, mes, dia).ok).toBe(false);
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(FechaCalendario.crear(2028, 2, 29).ok).toBe(true);
  });

  it('convierte desde y hacia el formato de ARCA', () => {
    const resultado = FechaCalendario.desdeTextoArca('20261023');

    expect(resultado.ok && resultado.valor.aTextoArca()).toBe('20261023');
    expect(resultado.ok && resultado.valor.formatear()).toBe('23/10/2026');
  });

  it.each(['', '2026-10-23', '2026102', '20261332', 'abcdefgh'])(
    'rechaza %s como fecha de ARCA',
    (texto) => {
      expect(FechaCalendario.desdeTextoArca(texto).ok).toBe(false);
    },
  );

  it('suma días cruzando meses y años', () => {
    expect(fecha(2026, 12, 30).sumarDias(3).formatear()).toBe('02/01/2027');
    expect(fecha(2026, 3, 1).sumarDias(-1).formatear()).toBe('28/02/2026');
  });

  it('compara fechas', () => {
    const hoy = fecha(2026, 10, 23);

    expect(hoy.diasHasta(fecha(2026, 11, 2))).toBe(10);
    expect(hoy.diasHasta(fecha(2026, 10, 13))).toBe(-10);
    expect(hoy.esAnteriorA(fecha(2026, 10, 24))).toBe(true);
    expect(hoy.esAnteriorA(hoy)).toBe(false);
    expect(hoy.esIgualA(fecha(2026, 10, 23))).toBe(true);
  });
});
