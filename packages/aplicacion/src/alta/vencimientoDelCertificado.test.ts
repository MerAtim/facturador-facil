import { describe, expect, it } from 'vitest';

import { avisoDeVencimiento } from './vencimientoDelCertificado';

// Vence el 30 de noviembre de 2026 a las 11:32 de Argentina.
const vigenteHasta = new Date('2026-11-30T14:32:00Z');
/** Las 10 de la mañana en Argentina de ese día. */
const el = (fecha: string) => new Date(`${fecha}T13:00:00Z`);

describe('avisoDeVencimiento', () => {
  it('no avisa con más de 30 días por delante', () => {
    expect(avisoDeVencimiento(vigenteHasta, el('2026-10-30'))).toEqual({ tipo: 'vigente' });
  });

  it('avisa desde los 30 días', () => {
    expect(avisoDeVencimiento(vigenteHasta, el('2026-10-31'))).toEqual({
      tipo: 'por_vencer',
      dias: 30,
      urgente: false,
    });
  });

  it('urge desde los 7 días', () => {
    expect(avisoDeVencimiento(vigenteHasta, el('2026-11-22'))).toEqual({
      tipo: 'por_vencer',
      dias: 8,
      urgente: false,
    });
    expect(avisoDeVencimiento(vigenteHasta, el('2026-11-23'))).toEqual({
      tipo: 'por_vencer',
      dias: 7,
      urgente: true,
    });
  });

  it('el mismo día, antes de la hora, todavía vale: vence hoy', () => {
    expect(avisoDeVencimiento(vigenteHasta, el('2026-11-30'))).toEqual({
      tipo: 'por_vencer',
      dias: 0,
      urgente: true,
    });
  });

  it('cuenta los días en Argentina, aunque en UTC ya sea otro día', () => {
    // Las 22 del 29 en Argentina son la 1 del 30 en UTC: falta un día, no cero.
    expect(avisoDeVencimiento(vigenteHasta, new Date('2026-11-30T01:00:00Z'))).toEqual({
      tipo: 'por_vencer',
      dias: 1,
      urgente: true,
    });
  });

  it('desde la hora de vencimiento, está vencido', () => {
    expect(avisoDeVencimiento(vigenteHasta, vigenteHasta)).toEqual({ tipo: 'vencido' });
    expect(avisoDeVencimiento(vigenteHasta, el('2027-01-01'))).toEqual({ tipo: 'vencido' });
  });
});
