import { AlmacenSeguroEnMemoria, type AlmacenSeguro } from '@facturador/aplicacion';
import { Cuit } from '@facturador/dominio';
import { beforeAll, describe, expect, it } from 'vitest';

import { crearCertificadoDePrueba, crearFirmadorDePrueba } from '../criptografia/paraPruebas';
import type { Transporte } from '../soap/transporte';
import { crearProveedorDeTickets } from './proveedorDeTickets';

const CLAVE = 'ticket.homologacion.20123456786.wsfe';
const cuit = (() => {
  const resultado = Cuit.crear('20123456786');
  if (!resultado.ok) throw new Error('CUIT de prueba inválido');
  return resultado.valor;
})();

const respuestaConTicket = (token: string, vencimiento: string) =>
  '<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<soapenv:Body><loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>' +
  '&lt;loginTicketResponse version="1.0"&gt;&lt;header&gt;' +
  `&lt;expirationTime&gt;${vencimiento}&lt;/expirationTime&gt;&lt;/header&gt;` +
  `&lt;credentials&gt;&lt;token&gt;${token}&lt;/token&gt;&lt;sign&gt;FIRMA&lt;/sign&gt;&lt;/credentials&gt;` +
  '&lt;/loginTicketResponse&gt;</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>';

/** Responde un ticket que vence 12 horas después de la hora del reloj y cuenta los pedidos. */
function crearWsaaFalso(reloj: { ahora: Date }) {
  const wsaa = {
    pedidos: 0,
    sinConexion: false,
    transporte: (() => {
      if (wsaa.sinConexion) return Promise.reject(new Error('sin red'));
      wsaa.pedidos++;
      const vencimiento = new Date(reloj.ahora.getTime() + 12 * 60 * 60 * 1000).toISOString();
      return Promise.resolve({
        estado: 200,
        cuerpo: respuestaConTicket(`TOKEN${String(wsaa.pedidos)}`, vencimiento),
      });
    }) as Transporte,
  };
  return wsaa;
}

let firmador: ReturnType<typeof crearFirmadorDePrueba>['firmador'];
let certificado: Uint8Array;

beforeAll(async () => {
  firmador = crearFirmadorDePrueba().firmador;
  certificado = await crearCertificadoDePrueba(firmador);
});

function preparar(almacen: AlmacenSeguro = new AlmacenSeguroEnMemoria()) {
  const reloj = { ahora: new Date('2026-10-26T12:00:00Z') };
  const wsaa = crearWsaaFalso(reloj);
  const crear = () =>
    crearProveedorDeTickets({
      ambiente: 'homologacion',
      cuit,
      servicio: 'wsfe',
      certificado,
      firmador,
      transporte: wsaa.transporte,
      almacen,
      reloj: () => reloj.ahora,
    });
  const avanzar = (minutos: number) => {
    reloj.ahora = new Date(reloj.ahora.getTime() + minutos * 60 * 1000);
  };
  return { almacen, wsaa, crear, avanzar };
}

const tokenDe = async (pedido: Promise<{ ok: boolean; valor?: { token: string } }>) =>
  (await pedido).valor?.token;

describe('crearProveedorDeTickets', () => {
  it('pide un ticket y lo reutiliza mientras está vigente', async () => {
    const { wsaa, crear, avanzar } = preparar();
    const proveedor = crear();

    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN1');
    avanzar(11 * 60);
    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN1');
    expect(wsaa.pedidos).toBe(1);
  });

  it('guarda token, firma y vencimiento en el almacén seguro', async () => {
    const { almacen, crear } = preparar();

    await crear().obtener();

    expect(JSON.parse((await almacen.leer(CLAVE)) ?? '')).toEqual({
      token: 'TOKEN1',
      firma: 'FIRMA',
      vencimiento: '2026-10-27T00:00:00.000Z',
    });
  });

  it('reutiliza el ticket guardado después de reiniciar la app', async () => {
    const { wsaa, crear } = preparar();

    await crear().obtener();

    expect(await tokenDe(crear().obtener())).toBe('TOKEN1');
    expect(wsaa.pedidos).toBe(1);
  });

  it('renueva diez minutos antes del vencimiento', async () => {
    const { wsaa, crear, avanzar } = preparar();
    const proveedor = crear();
    await proveedor.obtener();

    avanzar(12 * 60 - 11);
    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN1');

    avanzar(1);
    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN2');
    expect(wsaa.pedidos).toBe(2);
  });

  it('comparte un solo pedido a WSAA entre llamadas simultáneas', async () => {
    const { wsaa, crear } = preparar();
    const proveedor = crear();

    const tokens = await Promise.all([1, 2, 3].map(() => tokenDe(proveedor.obtener())));

    expect(tokens).toEqual(['TOKEN1', 'TOKEN1', 'TOKEN1']);
    expect(wsaa.pedidos).toBe(1);
  });

  it('no guarda los errores y vuelve a pedir en la llamada siguiente', async () => {
    const { wsaa, crear } = preparar();
    const proveedor = crear();

    wsaa.sinConexion = true;
    expect(await proveedor.obtener()).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });

    wsaa.sinConexion = false;
    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN1');
  });

  it('descarta el ticket al invalidarlo', async () => {
    const { almacen, wsaa, crear } = preparar();
    const proveedor = crear();
    await proveedor.obtener();

    await proveedor.invalidar();

    await expect(almacen.leer(CLAVE)).resolves.toBeUndefined();
    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN2');
    expect(wsaa.pedidos).toBe(2);
  });

  it.each([
    ['no es JSON', 'basura'],
    ['le falta la firma', '{"token":"T","vencimiento":"2026-10-27T00:00:00.000Z"}'],
    ['tiene una fecha inválida', '{"token":"T","firma":"F","vencimiento":"ayer"}'],
  ])('pide otro ticket si el guardado %s', async (_, guardado) => {
    const { almacen, wsaa, crear } = preparar();
    await almacen.guardar(CLAVE, guardado);

    expect(await tokenDe(crear().obtener())).toBe('TOKEN1');
    expect(wsaa.pedidos).toBe(1);
  });

  it('sigue funcionando si el almacén falla', async () => {
    const roto: AlmacenSeguro = {
      leer: () => Promise.reject(new Error('keystore no disponible')),
      guardar: () => Promise.reject(new Error('keystore no disponible')),
      borrar: () => Promise.resolve(),
    };
    const { wsaa, crear } = preparar(roto);
    const proveedor = crear();

    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN1');
    expect(await tokenDe(proveedor.obtener())).toBe('TOKEN1');
    expect(wsaa.pedidos).toBe(1);
  });
});
