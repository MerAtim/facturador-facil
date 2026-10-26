import { describe, expect, it } from 'vitest';

import { consultarEstadoDeServidores } from './wsfe';

// Respuesta real de homologación del 2026-10-26.
const respuestaFeDummy =
  '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<soap:Body><FEDummyResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEDummyResult><AppServer>OK</AppServer>' +
  '<DbServer>OK</DbServer><AuthServer>OK</AuthServer></FEDummyResult></FEDummyResponse></soap:Body></soap:Envelope>';

describe('consultarEstadoDeServidores', () => {
  it('llama a FEDummy y devuelve el estado de cada servidor', async () => {
    let accion = '';
    const resultado = await consultarEstadoDeServidores((_, { encabezados }) => {
      accion = encabezados['SOAPAction'] ?? '';
      return Promise.resolve({ estado: 200, cuerpo: respuestaFeDummy });
    }, 'https://wsfe');

    expect(accion).toBe('"http://ar.gov.afip.dif.FEV1/FEDummy"');
    expect(resultado).toEqual({
      ok: true,
      valor: { aplicacion: 'OK', baseDeDatos: 'OK', autenticacion: 'OK' },
    });
  });

  it('informa un estado HTTP inesperado sin falla SOAP', async () => {
    const resultado = await consultarEstadoDeServidores(
      () => Promise.resolve({ estado: 503, cuerpo: 'Service Unavailable' }),
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'respuesta_inesperada', estado: 503 } });
  });

  it('deja vacíos los campos que no vienen', async () => {
    const resultado = await consultarEstadoDeServidores(
      () =>
        Promise.resolve({
          estado: 200,
          cuerpo:
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
            '<FEDummyResponse/></soap:Body></soap:Envelope>',
        }),
      'https://wsfe',
    );

    expect(resultado).toEqual({
      ok: true,
      valor: { aplicacion: '', baseDeDatos: '', autenticacion: '' },
    });
  });
});
