import { describe, expect, it } from 'vitest';

import { llamarSoap } from './soap';
import type { RespuestaHttp } from './transporte';

const llamar = (respuesta: () => Promise<RespuestaHttp>) =>
  llamarSoap(respuesta, 'https://servicio', 'accion', '<pedido/>');

const sobre = (cuerpo: string) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;

describe('llamarSoap', () => {
  it('envía el pedido dentro de un sobre SOAP con la acción indicada', async () => {
    let enviado = { cuerpo: '', accion: '' };
    await llamarSoap(
      (_, { cuerpo, encabezados }) => {
        enviado = { cuerpo, accion: encabezados['SOAPAction'] ?? '' };
        return Promise.resolve({ estado: 200, cuerpo: sobre('<r/>') });
      },
      'https://servicio',
      'accion',
      '<pedido/>',
    );

    expect(enviado.accion).toBe('"accion"');
    expect(enviado.cuerpo).toContain('<soap:Body><pedido/></soap:Body>');
  });

  it('devuelve el primer elemento del cuerpo', async () => {
    const resultado = await llamar(() =>
      Promise.resolve({ estado: 200, cuerpo: sobre('<r><x>1</x></r>') }),
    );

    expect(resultado.ok && resultado.valor.nombre).toBe('r');
  });

  it('informa la falla SOAP sin el prefijo del código', async () => {
    const resultado = await llamar(() =>
      Promise.resolve({
        estado: 500,
        cuerpo: sobre(
          '<soap:Fault><faultcode xmlns:ns1="http://xml.apache.org/axis/">ns1:cms.bad</faultcode>' +
            '<faultstring>El CMS no es valido</faultstring></soap:Fault>',
        ),
      }),
    );

    expect(resultado).toEqual({
      ok: false,
      error: { tipo: 'falla_soap', codigo: 'cms.bad', mensaje: 'El CMS no es valido' },
    });
  });

  it('deja vacíos el código y el mensaje si la falla no los trae', async () => {
    const resultado = await llamar(() =>
      Promise.resolve({ estado: 500, cuerpo: sobre('<soap:Fault/>') }),
    );

    expect(resultado).toEqual({
      ok: false,
      error: { tipo: 'falla_soap', codigo: '', mensaje: '' },
    });
  });

  it('informa falta de conexión si el transporte falla', async () => {
    const resultado = await llamar(() => Promise.reject(new Error('timeout')));

    expect(resultado).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
  });

  it.each([
    ['una página de error HTML', 502, '<html><body>Bad Gateway</body>'],
    ['un sobre sin falla con estado de error', 503, sobre('<r/>')],
    ['un cuerpo vacío', 200, sobre('')],
  ])('informa respuesta inesperada ante %s', async (_, estado, cuerpo) => {
    const resultado = await llamar(() => Promise.resolve({ estado, cuerpo }));

    expect(resultado).toEqual({ ok: false, error: { tipo: 'respuesta_inesperada', estado } });
  });

  it('informa XML inválido con estado 200', async () => {
    const resultado = await llamar(() => Promise.resolve({ estado: 200, cuerpo: '<a><b></a>' }));

    expect(resultado).toEqual({
      ok: false,
      error: { tipo: 'xml_invalido', motivo: 'mal_formado' },
    });
  });
});
