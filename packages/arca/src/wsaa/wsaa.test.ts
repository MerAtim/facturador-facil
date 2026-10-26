import { describe, expect, it } from 'vitest';

import { crearCertificadoDePrueba, crearFirmadorDePrueba } from '../criptografia/paraPruebas';
import type { Transporte } from '../soap/transporte';
import { crearTra, solicitarTicket } from './wsaa';

const ahora = new Date('2026-10-26T12:00:00Z');

const respuestaExitosa =
  '<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<soapenv:Body><loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>' +
  '&lt;?xml version="1.0" encoding="UTF-8"?&gt;&lt;loginTicketResponse version="1.0"&gt;&lt;header&gt;' +
  '&lt;expirationTime&gt;2026-10-27T00:00:00.000-03:00&lt;/expirationTime&gt;&lt;/header&gt;' +
  '&lt;credentials&gt;&lt;token&gt;TOKEN&lt;/token&gt;&lt;sign&gt;FIRMA&lt;/sign&gt;&lt;/credentials&gt;' +
  '&lt;/loginTicketResponse&gt;</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>';

const fallaCms =
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault>' +
  '<faultcode xmlns:ns1="http://xml.apache.org/axis/">ns1:cms.cert.untrusted</faultcode>' +
  '<faultstring>Certificado no emitido por AC de confianza</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>';

async function pedir(transporte: Transporte) {
  const { firmador } = crearFirmadorDePrueba();
  const certificado = await crearCertificadoDePrueba(firmador);
  return solicitarTicket(
    { servicio: 'wsfe', certificado, ahora },
    firmador,
    transporte,
    'https://wsaa',
  );
}

describe('crearTra', () => {
  it('pide el servicio con una ventana de diez minutos alrededor de ahora', () => {
    expect(crearTra('wsfe', ahora)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>' +
        '<uniqueId>1793016000</uniqueId><generationTime>2026-10-26T11:50:00Z</generationTime>' +
        '<expirationTime>2026-10-26T12:10:00Z</expirationTime></header><service>wsfe</service>' +
        '</loginTicketRequest>',
    );
  });
});

describe('solicitarTicket', () => {
  it('envía el CMS en base64 y devuelve el ticket de acceso', async () => {
    let cuerpoEnviado = '';
    const resultado = await pedir((_, { cuerpo }) => {
      cuerpoEnviado = cuerpo;
      return Promise.resolve({ estado: 200, cuerpo: respuestaExitosa });
    });

    expect(cuerpoEnviado).toMatch(/<in0>MI[A-Za-z0-9+/=]+<\/in0>/);
    expect(resultado).toEqual({
      ok: true,
      valor: { token: 'TOKEN', firma: 'FIRMA', vencimiento: new Date('2026-10-27T03:00:00Z') },
    });
  });

  it('devuelve la falla que informa WSAA', async () => {
    const resultado = await pedir(() => Promise.resolve({ estado: 500, cuerpo: fallaCms }));

    expect(resultado).toEqual({
      ok: false,
      error: {
        tipo: 'falla_soap',
        codigo: 'cms.cert.untrusted',
        mensaje: 'Certificado no emitido por AC de confianza',
      },
    });
  });

  it('detecta una respuesta sin ticket', async () => {
    const resultado = await pedir(() =>
      Promise.resolve({
        estado: 200,
        cuerpo: '<loginCmsReturn></loginCmsReturn>',
      }),
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'ticket_incompleto' } });
  });
});
