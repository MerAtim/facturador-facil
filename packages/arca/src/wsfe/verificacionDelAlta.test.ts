import { readFileSync } from 'node:fs';

import { Cuit, exito, fallo } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { Ambiente } from '../ambiente';
import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';
import { verificarAlta } from './verificacionDelAlta';

const grabacion = (nombre: string) =>
  readFileSync(new URL(`./grabaciones/${nombre}.xml`, import.meta.url), 'utf8');

const cuit = (() => {
  const resultado = Cuit.crear('20123456786');
  if (!resultado.ok) throw new Error('CUIT de prueba inválido');
  return resultado.valor;
})();

const sobre = (cuerpo: string) =>
  '<?xml version="1.0" encoding="utf-8"?><soap:Envelope ' +
  'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
  `${cuerpo}</soap:Body></soap:Envelope>`;

const dummy = (aplicacion = 'OK') =>
  sobre(
    '<FEDummyResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEDummyResult>' +
      `<AppServer>${aplicacion}</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>` +
      '</FEDummyResult></FEDummyResponse>',
  );

interface Punto {
  readonly nro: number;
  readonly tipo?: string;
  readonly bloqueado?: boolean;
  readonly baja?: string;
}

const puntos = (...lista: Punto[]) =>
  sobre(
    '<FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult>' +
      '<ResultGet>' +
      lista
        .map(
          ({ nro, tipo = 'CAE - RECE', bloqueado = false, baja = 'NULL' }) =>
            `<PtoVenta><Nro>${String(nro)}</Nro><EmisionTipo>${tipo}</EmisionTipo>` +
            `<Bloqueado>${bloqueado ? 'S' : 'N'}</Bloqueado><FchBaja>${baja}</FchBaja></PtoVenta>`,
        )
        .join('') +
      '</ResultGet></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse>',
  );

const errorWsfe = (codigo: number) =>
  sobre(
    '<FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult>' +
      `<Errors><Err><Code>${String(codigo)}</Code><Msg>Error</Msg></Err></Errors>` +
      '</FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse>',
  );

/** Responde a FEDummy y a la consulta de puntos de venta según el método pedido. */
function arca({
  feDummy = dummy(),
  ptosVenta = [puntos({ nro: 3 })],
}: { feDummy?: string | Error; ptosVenta?: (string | Error)[] } = {}) {
  const pedidos: string[] = [];
  const transporte: Transporte = (_, { encabezados }) => {
    const metodo = (encabezados['SOAPAction'] ?? '').replace(/.*\/|"/g, '');
    pedidos.push(metodo);
    const respuesta = metodo === 'FEDummy' ? feDummy : (ptosVenta.shift() ?? puntos());
    return respuesta instanceof Error
      ? Promise.reject(respuesta)
      : Promise.resolve({ estado: 200, cuerpo: respuesta });
  };
  return { transporte, pedidos };
}

function tickets(error?: ErrorWsaa) {
  const estado = { invalidaciones: 0 };
  const proveedor: ProveedorDeTickets = {
    obtener: () =>
      Promise.resolve(
        error
          ? fallo(error)
          : exito({ token: 'T', firma: 'F', vencimiento: new Date('2030-01-01') }),
      ),
    invalidar: () => {
      estado.invalidaciones++;
      return Promise.resolve();
    },
  };
  return Object.assign(estado, { proveedor });
}

interface Opciones {
  readonly ambiente?: Ambiente;
  readonly puntoDeVenta?: number;
  readonly proveedor?: ProveedorDeTickets;
}

const verificar = (
  servidor: ReturnType<typeof arca>,
  { ambiente = 'produccion', puntoDeVenta = 3, proveedor = tickets().proveedor }: Opciones = {},
) =>
  verificarAlta({
    ambiente,
    cuit,
    puntoDeVenta,
    tickets: proveedor,
    transporte: servidor.transporte,
  });

describe('verificarAlta', () => {
  it('con todo en orden, devuelve el punto de venta habilitado', async () => {
    const servidor = arca();

    expect(await verificar(servidor)).toEqual({
      ok: true,
      valor: {
        puntoDeVenta: { numero: 3, tipoDeEmision: 'CAE - RECE', bloqueado: false },
      },
    });
    expect(servidor.pedidos).toEqual(['FEDummy', 'FEParamGetPtosVenta']);
  });

  it('sin conexión, falla en la primera etapa sin pedir acceso', async () => {
    const servidor = arca({ feDummy: new Error('sin red') });

    expect(await verificar(servidor)).toEqual({
      ok: false,
      error: { etapa: 'conexion', tipo: 'error', error: { tipo: 'sin_conexion' } },
    });
    expect(servidor.pedidos).toEqual(['FEDummy']);
  });

  it('si un servidor de ARCA no está bien, lo informa', async () => {
    const resultado = await verificar(arca({ feDummy: dummy('ERROR') }));

    expect(resultado).toMatchObject({
      ok: false,
      error: { etapa: 'conexion', tipo: 'servicio_caido', servidores: { aplicacion: 'ERROR' } },
    });
  });

  it('si ARCA no da acceso con el certificado, falla en el acceso', async () => {
    const rechazo: ErrorWsaa = {
      tipo: 'rechazo_wsaa',
      motivo: 'no_autorizado',
      codigo: 'coe.notAuthorized',
      mensaje: 'Computador no autorizado a acceder al servicio',
    };

    expect(await verificar(arca(), { proveedor: tickets(rechazo).proveedor })).toEqual({
      ok: false,
      error: { etapa: 'acceso', tipo: 'error', error: rechazo },
    });
  });

  it('si el certificado no puede operar con la CUIT, falla en el acceso', async () => {
    const resultado = await verificar(arca({ ptosVenta: [errorWsfe(601)] }));

    expect(resultado).toMatchObject({ ok: false, error: { etapa: 'acceso', tipo: 'error' } });
  });

  it('pide otro ticket si ARCA rechaza el guardado', async () => {
    const proveedor = tickets();
    const servidor = arca({ ptosVenta: [errorWsfe(600), puntos({ nro: 3 })] });

    expect((await verificar(servidor, { proveedor: proveedor.proveedor })).ok).toBe(true);
    expect(proveedor.invalidaciones).toBe(1);
  });

  it('otro rechazo de la consulta falla en el punto de venta', async () => {
    const resultado = await verificar(arca({ ptosVenta: [errorWsfe(500)] }));

    expect(resultado).toMatchObject({
      ok: false,
      error: { etapa: 'punto_de_venta', tipo: 'error' },
    });
  });

  it('en producción, un punto de venta que no está da los que sí se pueden usar', async () => {
    const servidor = arca({
      ptosVenta: [puntos({ nro: 1 }), puntos({ nro: 2 }, { nro: 4, bloqueado: true }, { nro: 5 })],
    });

    expect(await verificar(servidor)).toEqual({
      ok: false,
      error: { etapa: 'punto_de_venta', tipo: 'punto_de_venta_inexistente', habilitados: [1] },
    });
    expect(await verificar(servidor)).toMatchObject({ error: { habilitados: [2, 5] } });
  });

  it('en producción, sin ningún punto de venta web service, no hay sugerencias', async () => {
    const servidor = arca({ ptosVenta: [grabacion('puntosDeVentaSinResultados')] });

    expect(await verificar(servidor)).toMatchObject({
      ok: false,
      error: { tipo: 'punto_de_venta_inexistente', habilitados: [] },
    });
  });

  it.each([
    ['dado_de_baja', { nro: 3, baja: '20250101' }],
    ['bloqueado', { nro: 3, bloqueado: true }],
    ['solo_caea', { nro: 3, tipo: 'CAEA - RECE' }],
  ] as const)('rechaza un punto de venta %s', async (motivo, punto) => {
    expect(await verificar(arca({ ptosVenta: [puntos(punto)] }))).toEqual({
      ok: false,
      error: { etapa: 'punto_de_venta', tipo: 'punto_de_venta_no_habilitado', motivo },
    });
  });

  it('en homologación, sin puntos de venta informados, alcanza con el acceso', async () => {
    const servidor = arca({ ptosVenta: [grabacion('puntosDeVentaSinResultados')] });

    expect(await verificar(servidor, { ambiente: 'homologacion' })).toEqual({
      ok: true,
      valor: {},
    });
  });
});
