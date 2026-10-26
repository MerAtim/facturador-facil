import { afterEach, describe, expect, it, vi } from 'vitest';

import { transporteFetch } from './transporte';

const solicitud = { encabezados: { SOAPAction: '"x"' }, cuerpo: '<a/>' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('transporteFetch', () => {
  it('hace un POST y devuelve estado y cuerpo', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('<ok/>', { status: 200 })));
    vi.stubGlobal('fetch', fetch);

    const respuesta = await transporteFetch('https://servicio', solicitud);

    expect(respuesta).toEqual({ estado: 200, cuerpo: '<ok/>' });
    expect(fetch).toHaveBeenCalledWith(
      'https://servicio',
      expect.objectContaining({ method: 'POST', headers: solicitud.encabezados, body: '<a/>' }),
    );
  });

  it('corta el pedido a los 30 segundos', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      (_: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolver, rechazar) => {
          signal.addEventListener('abort', () => {
            rechazar(new Error('abortado'));
          });
        }),
    );

    const pedido = transporteFetch('https://servicio', solicitud);
    vi.advanceTimersByTime(30_000);

    await expect(pedido).rejects.toThrow('abortado');
  });
});
