import { describe, expect, it } from 'vitest';

import { Cuit } from './cuit';

describe('Cuit', () => {
  it.each([
    ['20123456786', '20123456786'],
    ['27345678900', '27345678900'],
    ['33693450239', '33693450239'],
    ['30712345671', '30712345671'],
    ['20-12345678-6', '20123456786'],
    [' 20 12345678 6 ', '20123456786'],
  ])('acepta %s', (texto, esperado) => {
    const resultado = Cuit.crear(texto);

    expect(resultado.ok && resultado.valor.valor).toBe(esperado);
  });

  it.each([
    ['', 'longitud_invalida'],
    ['2012345678', 'longitud_invalida'],
    ['201234567861', 'longitud_invalida'],
    ['20.12345678.6', 'caracteres_invalidos'],
    ['20l23456786', 'caracteres_invalidos'],
    ['99123456786', 'prefijo_invalido'],
    ['20123456787', 'digito_verificador_invalido'],
    ['30693450230', 'digito_verificador_invalido'],
  ])('rechaza %s por %s', (texto, motivo) => {
    const resultado = Cuit.crear(texto);

    expect(resultado).toEqual({ ok: false, error: { tipo: 'cuit_invalido', motivo } });
  });

  it('se muestra con el formato habitual', () => {
    const resultado = Cuit.crear('20123456786');

    expect(resultado.ok && resultado.valor.formateado()).toBe('20-12345678-6');
  });

  it('compara por valor', () => {
    const a = Cuit.crear('20-12345678-6');
    const b = Cuit.crear('20123456786');

    expect(a.ok && b.ok && a.valor.esIgualA(b.valor)).toBe(true);
  });
});
