import { describe, expect, it } from 'vitest';

import { Dni } from './dni';

describe('Dni', () => {
  it.each([
    ['12345678', '12345678'],
    ['12.345.678', '12345678'],
    ['1.234.567', '1234567'],
    [' 30111222 ', '30111222'],
  ])('acepta %s', (texto, esperado) => {
    const resultado = Dni.crear(texto);

    expect(resultado.ok && resultado.valor.valor).toBe(esperado);
  });

  it.each(['', '123456', '123456789', '12a45678', '12-345-678'])('rechaza %s', (texto) => {
    expect(Dni.crear(texto)).toEqual({ ok: false, error: { tipo: 'dni_invalido' } });
  });
});
