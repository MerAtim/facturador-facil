import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { conLimiteDeTiempo, TiempoAgotado } from './limiteDeTiempo';

describe('conLimiteDeTiempo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve lo que da la promesa si termina a tiempo', async () => {
    await expect(conLimiteDeTiempo(Promise.resolve('pdf'), 1_000, 'armar el PDF')).resolves.toBe(
      'pdf',
    );
  });

  it('rechaza con el mismo error si la promesa falla a tiempo', async () => {
    const error = new Error('sin espacio');

    await expect(conLimiteDeTiempo(Promise.reject(error), 1_000, 'armar el PDF')).rejects.toBe(
      error,
    );
  });

  it('rechaza con TiempoAgotado si la promesa no termina nunca', async () => {
    const espera = conLimiteDeTiempo(new Promise<never>(() => undefined), 1_000, 'armar el PDF');
    const resultado = expect(espera).rejects.toBeInstanceOf(TiempoAgotado);

    await vi.advanceTimersByTimeAsync(1_000);

    await resultado;
  });

  it('no corta antes del plazo', async () => {
    let terminar: (valor: string) => void = () => undefined;
    const lenta = new Promise<string>((resolver) => {
      terminar = resolver;
    });
    const espera = conLimiteDeTiempo(lenta, 1_000, 'armar el PDF');

    await vi.advanceTimersByTimeAsync(999);
    terminar('pdf');

    await expect(espera).resolves.toBe('pdf');
  });
});
