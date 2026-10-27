import { readFileSync } from 'node:fs';

import { Cuit } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { Transporte } from '../soap/transporte';
import {
  consultarAlicuotasDeIva,
  consultarCondicionesIvaReceptor,
  consultarEstadoDeServidores,
  consultarMonedas,
  consultarPuntosDeVenta,
  consultarTiposDeComprobante,
} from './wsfe';

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

const grabacion = (nombre: string) =>
  readFileSync(new URL(`./grabaciones/${nombre}.xml`, import.meta.url), 'utf8');

const cuit = (() => {
  const resultado = Cuit.crear('20123456786');
  if (!resultado.ok) throw new Error('CUIT de prueba inválido');
  return resultado.valor;
})();

const autorizacion = {
  ticket: { token: 'TOKEN', firma: 'FIRMA', vencimiento: new Date('2026-10-27T00:00:00Z') },
  cuit,
};

/** Devuelve siempre la misma respuesta y guarda la última solicitud. */
function responder(cuerpo: string) {
  const enviado = { accion: '', cuerpo: '' };
  const transporte: Transporte = (_, solicitud) => {
    enviado.accion = solicitud.encabezados['SOAPAction'] ?? '';
    enviado.cuerpo = solicitud.cuerpo;
    return Promise.resolve({ estado: 200, cuerpo });
  };
  return { transporte, enviado };
}

describe('consultas de parámetros', () => {
  it('pide los tipos de comprobante con la autorización', async () => {
    const { transporte, enviado } = responder(grabacion('tiposDeComprobante'));

    const resultado = await consultarTiposDeComprobante(autorizacion, transporte, 'https://wsfe');

    expect(enviado.accion).toBe('"http://ar.gov.afip.dif.FEV1/FEParamGetTiposCbte"');
    expect(enviado.cuerpo).toContain(
      '<FEParamGetTiposCbte xmlns="http://ar.gov.afip.dif.FEV1/"><Auth><Token>TOKEN</Token>' +
        '<Sign>FIRMA</Sign><Cuit>20123456786</Cuit></Auth></FEParamGetTiposCbte>',
    );
    if (!resultado.ok) throw new Error('se esperaba éxito');
    expect(resultado.valor).toHaveLength(36);
    expect(resultado.valor[0]).toEqual({ id: '1', descripcion: 'Factura A' });
    expect(resultado.valor).toContainEqual({ id: '11', descripcion: 'Factura C' });
  });

  it('escapa los valores que inserta en el XML', async () => {
    const { transporte, enviado } = responder(grabacion('alicuotasDeIva'));

    await consultarAlicuotasDeIva(
      { ...autorizacion, ticket: { ...autorizacion.ticket, token: '</Token><Cuit>1</Cuit>&' } },
      transporte,
      'https://wsfe',
    );

    expect(enviado.cuerpo).toContain(
      '<Token>&lt;/Token&gt;&lt;Cuit&gt;1&lt;/Cuit&gt;&amp;</Token>',
    );
  });

  it('lee las alícuotas de IVA', async () => {
    const resultado = await consultarAlicuotasDeIva(
      autorizacion,
      responder(grabacion('alicuotasDeIva')).transporte,
      'https://wsfe',
    );

    expect(resultado.ok && resultado.valor.map(({ descripcion }) => descripcion)).toEqual([
      '0%',
      '10.5%',
      '21%',
      '27%',
      '5%',
      '2.5%',
    ]);
  });

  it('lee las monedas con su código alfanumérico', async () => {
    const resultado = await consultarMonedas(
      autorizacion,
      responder(grabacion('monedas')).transporte,
      'https://wsfe',
    );

    expect(resultado.ok && resultado.valor.slice(0, 2)).toEqual([
      { id: 'PES', descripcion: 'Pesos Argentinos' },
      { id: 'DOL', descripcion: 'Dólar Estadounidense' },
    ]);
  });

  it('lee las condiciones de IVA del receptor con las clases de comprobante', async () => {
    const resultado = await consultarCondicionesIvaReceptor(
      autorizacion,
      responder(grabacion('condicionesIvaReceptor')).transporte,
      'https://wsfe',
    );

    expect(resultado.ok && resultado.valor).toContainEqual({
      id: '5',
      descripcion: 'Consumidor Final',
      clases: 'C/49',
    });
  });

  it('devuelve una lista vacía cuando no hay puntos de venta', async () => {
    const resultado = await consultarPuntosDeVenta(
      autorizacion,
      responder(grabacion('puntosDeVentaSinResultados')).transporte,
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: true, valor: [] });
  });

  it('lee los puntos de venta', async () => {
    // Homologación no devuelve puntos de venta: la respuesta sigue el formato del manual de WSFEv1.
    const { transporte } = responder(
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
        '<FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult>' +
        '<ResultGet><PtoVenta><Nro>2</Nro><EmisionTipo>CAE - Ventanilla</EmisionTipo>' +
        '<Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta><PtoVenta><Nro>3</Nro>' +
        '<EmisionTipo>CAE - Ventanilla</EmisionTipo><Bloqueado>S</Bloqueado><FchBaja>20250101</FchBaja>' +
        '</PtoVenta></ResultGet></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse>' +
        '</soap:Body></soap:Envelope>',
    );

    const resultado = await consultarPuntosDeVenta(autorizacion, transporte, 'https://wsfe');

    expect(resultado).toEqual({
      ok: true,
      valor: [
        { numero: 2, tipoDeEmision: 'CAE - Ventanilla', bloqueado: false },
        { numero: 3, tipoDeEmision: 'CAE - Ventanilla', bloqueado: true, fechaDeBaja: '20250101' },
      ],
    });
  });

  it('informa los errores de ARCA', async () => {
    const resultado = await consultarTiposDeComprobante(
      autorizacion,
      responder(grabacion('tokenInvalido')).transporte,
      'https://wsfe',
    );

    expect(resultado).toEqual({
      ok: false,
      error: {
        tipo: 'rechazo_wsfe',
        errores: [
          {
            codigo: 600,
            mensaje: expect.stringContaining('ValidacionDeToken') as string,
          },
        ],
      },
    });
  });

  it('propaga los errores de transporte', async () => {
    const resultado = await consultarMonedas(
      autorizacion,
      () => Promise.reject(new Error('sin red')),
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
  });

  it.each([
    [
      'otro método',
      '<FEParamGetTiposCbteResponse><FEParamGetTiposCbteResult/></FEParamGetTiposCbteResponse>',
    ],
    ['ningún resultado', '<FEParamGetTiposMonedasResponse/>'],
  ])('rechaza una respuesta de %s', async (_, contenido) => {
    const resultado = await consultarMonedas(
      autorizacion,
      responder(
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
          `${contenido}</soap:Body></soap:Envelope>`,
      ).transporte,
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: false, error: { tipo: 'respuesta_inesperada', estado: 200 } });
  });

  it('devuelve una lista vacía si el resultado no trae ResultGet', async () => {
    const resultado = await consultarMonedas(
      autorizacion,
      responder(
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
          '<FEParamGetTiposMonedasResponse><FEParamGetTiposMonedasResult/>' +
          '</FEParamGetTiposMonedasResponse></soap:Body></soap:Envelope>',
      ).transporte,
      'https://wsfe',
    );

    expect(resultado).toEqual({ ok: true, valor: [] });
  });
});
