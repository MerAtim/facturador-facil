import { describe, expect, it } from 'vitest';

import { debeBloquear, esEsperaDeBloqueo } from './bloqueo';

describe('debeBloquear', () => {
  it('al abrir la app, sin registro de cuándo salió, bloquea', () => {
    expect(debeBloquear(undefined, 1_000, 'cinco_minutos')).toBe(true);
  });

  it.each([
    ['al_instante', 0, true],
    ['un_minuto', 59_999, false],
    ['un_minuto', 60_000, true],
    ['cinco_minutos', 299_999, false],
    ['cinco_minutos', 300_000, true],
  ] as const)('con espera %s, %i ms afuera: %s', (espera, afuera, bloquea) => {
    expect(debeBloquear(1_000, 1_000 + afuera, espera)).toBe(bloquea);
  });

  it('si el reloj retrocede, bloquea', () => {
    expect(debeBloquear(10_000, 5_000, 'cinco_minutos')).toBe(true);
  });
});

describe('esEsperaDeBloqueo', () => {
  it('reconoce solo las esperas definidas', () => {
    expect(esEsperaDeBloqueo('un_minuto')).toBe(true);
    expect(esEsperaDeBloqueo('nunca')).toBe(false);
    expect(esEsperaDeBloqueo(undefined)).toBe(false);
  });
});
