import { describe, expect, it } from 'vitest';

import type { Firmador } from '../criptografia/firmador';
import { crearCertificadoDePrueba, crearFirmadorDePrueba } from '../criptografia/paraPruebas';
import type { Transporte } from '../soap/transporte';
import { crearTra, solicitarTicket } from './wsaa';

const ahora = new Date('2026-10-26T12:00:00Z');

const sobre = (cuerpo: string) =>
  '<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
  `<soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`;

const conTicket = (ticket: string) =>
  sobre(
    '<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
      `<loginCmsReturn>${ticket}</loginCmsReturn></loginCmsResponse>`,
  );

const respuestaExitosa = conTicket(
  '&lt;?xml version="1.0" encoding="UTF-8" standalone="yes"?&gt;' +
    '&lt;loginTicketResponse version="1.0"&gt;&lt;header&gt;' +
    '&lt;source&gt;CN=wsaahomo, O=AFIP, C=AR, SERIALNUMBER=CUIT 33693450239&lt;/source&gt;' +
    '&lt;destination&gt;SERIALNUMBER=CUIT 20123456786, CN=facturadorfacil&lt;/destination&gt;' +
    '&lt;uniqueId&gt;123&lt;/uniqueId&gt;' +
    '&lt;generationTime&gt;2026-10-26T08:50:00.000-03:00&lt;/generationTime&gt;' +
    '&lt;expirationTime&gt;2026-10-26T21:00:00.000-03:00&lt;/expirationTime&gt;&lt;/header&gt;' +
    '&lt;credentials&gt;&lt;token&gt;VE9LRU4=&lt;/token&gt;&lt;sign&gt;RklSTUE=&lt;/sign&gt;&lt;/credentials&gt;' +
    '&lt;/loginTicketResponse&gt;',
);

describe('solicitarTicket sin firma', () => {
  it('si el teléfono no firma, no llama a WSAA y lo informa', async () => {
    const { firmador } = crearFirmadorDePrueba();
    const certificado = await crearCertificadoDePrueba(firmador);
    const llamadas: string[] = [];
    const bloqueado: Firmador = {
      clavePublica: () => firmador.clavePublica(),
      firmar: () => Promise.reject(new Error('teléfono bloqueado')),
    };

    const resultado = await solicitarTicket(
      { servicio: 'wsfe', certificado, ahora },
      bloqueado,
      (url) => {
        llamadas.push(url);
        return Promise.resolve({ estado: 200, cuerpo: '' });
      },
      'https://wsaa',
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'firma_no_disponible' } });
    expect(llamadas).toEqual([]);
  });
});

const falla = (codigo: string, mensaje: string) =>
  sobre(
    '<soapenv:Fault><faultcode xmlns:ns1="http://xml.apache.org/axis/">' +
      `ns1:${codigo}</faultcode><faultstring>${mensaje}</faultstring></soapenv:Fault>`,
  );

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
  it('pide el servicio con una ventana de diez minutos en hora argentina', () => {
    expect(crearTra('wsfe', ahora)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>' +
        '<uniqueId>1793016000</uniqueId><generationTime>2026-10-26T08:50:00-03:00</generationTime>' +
        '<expirationTime>2026-10-26T09:10:00-03:00</expirationTime></header><service>wsfe</service>' +
        '</loginTicketRequest>',
    );
  });

  it('cambia de día según la hora argentina y no la UTC', () => {
    expect(crearTra('wsfe', new Date('2026-10-27T02:00:00Z'))).toContain(
      '<generationTime>2026-10-26T22:50:00-03:00</generationTime>',
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
      valor: {
        token: 'VE9LRU4=',
        firma: 'RklSTUE=',
        vencimiento: new Date('2026-10-27T00:00:00Z'),
      },
    });
  });

  it.each([
    ['coe.alreadyAuthenticated', 'ticket_vigente'],
    ['coe.notAuthorized', 'no_autorizado'],
    ['cms.cert.expired', 'certificado_vencido'],
    ['cms.cert.untrusted', 'certificado_no_confiable'],
    ['cms.sign.invalid', 'firma_invalida'],
    ['xml.generationTime.invalid', 'reloj_desfasado'],
    ['wsaa.unavailable', 'no_disponible'],
    ['algo.nuevo', 'desconocido'],
  ])('traduce la falla %s a %s', async (codigo, motivo) => {
    const resultado = await pedir(() =>
      Promise.resolve({ estado: 500, cuerpo: falla(codigo, 'mensaje de ARCA') }),
    );

    expect(resultado).toEqual({
      ok: false,
      error: { tipo: 'rechazo_wsaa', motivo, codigo, mensaje: 'mensaje de ARCA' },
    });
  });

  it('propaga la falta de conexión', async () => {
    const resultado = await pedir(() => Promise.reject(new Error('sin red')));

    expect(resultado).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
  });

  it.each([
    ['sin loginCmsReturn', sobre('<loginCmsResponse/>')],
    ['con un ticket que no es XML', conTicket('no es xml')],
    [
      'sin token',
      conTicket(
        '&lt;r&gt;&lt;header&gt;&lt;expirationTime&gt;2026-10-26T21:00:00-03:00&lt;/expirationTime&gt;&lt;/header&gt;&lt;/r&gt;',
      ),
    ],
    [
      'con un vencimiento inválido',
      conTicket(
        '&lt;r&gt;&lt;header&gt;&lt;expirationTime&gt;mañana&lt;/expirationTime&gt;&lt;/header&gt;' +
          '&lt;credentials&gt;&lt;token&gt;T&lt;/token&gt;&lt;sign&gt;S&lt;/sign&gt;&lt;/credentials&gt;&lt;/r&gt;',
      ),
    ],
  ])('detecta una respuesta %s', async (_, cuerpo) => {
    const resultado = await pedir(() => Promise.resolve({ estado: 200, cuerpo }));

    expect(resultado).toEqual({ ok: false, error: { tipo: 'ticket_ilegible' } });
  });
});
