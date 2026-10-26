import { describe, expect, it } from 'vitest';

import { aBase64, aPem, desdeBase64, desdePem } from './codificacion';

describe('codificacion', () => {
  it('convierte a base64 y vuelve', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 256);

    expect(desdeBase64(aBase64(bytes))).toEqual(bytes);
  });

  it('arma PEM en líneas de 64 caracteres y lo lee', () => {
    const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
    const pem = aPem('CERTIFICATE', bytes);

    expect(pem.split('\n')[1]).toHaveLength(64);
    expect(desdePem('CERTIFICATE', pem)).toEqual(bytes);
  });

  it('falla si no encuentra el bloque PEM pedido', () => {
    expect(() => desdePem('CERTIFICATE', 'nada')).toThrow('CERTIFICATE');
  });
});
