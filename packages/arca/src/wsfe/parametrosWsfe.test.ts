import { readFileSync } from 'node:fs';

import { AlmacenEnMemoria, type AlmacenLocal } from '@facturador/aplicacion';
import { Cuit, exito, fallo } from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import { crearParametrosWsfe } from './parametrosWsfe';

const CLAVE = 'parametros.v1.homologacion.20123456786.monedas';
const HORA_MS = 60 * 60 * 1000;

const grabacion = (nombre: string) =>
  readFileSync(new URL(`./grabaciones/${nombre}.xml`, import.meta.url), 'utf8');

const cuit = (() => {
  const resultado = Cuit.crear('20123456786');
  if (!resultado.ok) throw new Error('CUIT de prueba inválido');
  return resultado.valor;
})();

function crearTickets() {
  const estado = { invalidaciones: 0, sinTicket: false };
  const proveedor: ProveedorDeTickets = {
    obtener: () =>
      Promise.resolve(
        estado.sinTicket
          ? fallo({ tipo: 'sin_conexion' as const })
          : exito({ token: 'T', firma: 'F', vencimiento: new Date('2030-01-01') }),
      ),
    invalidar: () => {
      estado.invalidaciones++;
      return Promise.resolve();
    },
  };
  return Object.assign(estado, { proveedor });
}

/** Responde con la grabación de monedas, o con lo que se programe, y cuenta las llamadas. */
function crearWsfe() {
  const wsfe = {
    llamadas: 0,
    respuestas: [] as (string | Error)[],
    transporte: (() => {
      wsfe.llamadas++;
      const siguiente = wsfe.respuestas.shift() ?? grabacion('monedas');
      return siguiente instanceof Error
        ? Promise.reject(siguiente)
        : Promise.resolve({ estado: 200, cuerpo: siguiente });
    }) as Transporte,
  };
  return wsfe;
}

function preparar(almacen: AlmacenLocal = new AlmacenEnMemoria()) {
  const reloj = { ahora: new Date('2026-10-26T12:00:00Z') };
  const tickets = crearTickets();
  const wsfe = crearWsfe();
  const crear = () =>
    crearParametrosWsfe({
      ambiente: 'homologacion',
      cuit,
      tickets: tickets.proveedor,
      transporte: wsfe.transporte,
      almacen,
      reloj: () => reloj.ahora,
    });
  const avanzar = (horas: number) => {
    reloj.ahora = new Date(reloj.ahora.getTime() + horas * HORA_MS);
  };
  return { almacen, tickets, wsfe, crear, avanzar };
}

/** Error de ARCA con la forma de la respuesta de monedas, como la grabación de token inválido. */
const rechazo = (codigo: number, mensaje: string) =>
  '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
  '<FEParamGetTiposMonedasResponse><FEParamGetTiposMonedasResult><Errors><Err>' +
  `<Code>${String(codigo)}</Code><Msg>${mensaje}</Msg></Err></Errors></FEParamGetTiposMonedasResult>` +
  '</FEParamGetTiposMonedasResponse></soap:Body></soap:Envelope>';
const tokenInvalido = rechazo(600, 'ValidacionDeToken: No valido token.');

const cantidad = async (consulta: Promise<{ ok: boolean; valor?: readonly unknown[] }>) =>
  (await consulta).valor?.length;

describe('crearParametrosWsfe', () => {
  it('consulta una vez y reutiliza el resultado durante un día', async () => {
    const { wsfe, crear, avanzar } = preparar();
    const parametros = crear();

    expect(await cantidad(parametros.monedas())).toBe(49);
    avanzar(23);
    expect(await cantidad(parametros.monedas())).toBe(49);
    expect(wsfe.llamadas).toBe(1);
  });

  it('guarda el resultado para los próximos inicios de la app', async () => {
    const { almacen, wsfe, crear } = preparar();

    await crear().monedas();
    expect(await cantidad(crear().monedas())).toBe(49);

    expect(wsfe.llamadas).toBe(1);
    const guardado = JSON.parse((await almacen.leer(CLAVE)) ?? '') as { consultado: string };
    expect(guardado.consultado).toBe('2026-10-26T12:00:00.000Z');
  });

  it('vuelve a consultar después de un día', async () => {
    const { wsfe, crear, avanzar } = preparar();
    const parametros = crear();
    await parametros.monedas();

    avanzar(24);
    await parametros.monedas();

    expect(wsfe.llamadas).toBe(2);
  });

  it('vuelve a consultar si el reloj del teléfono retrocedió', async () => {
    const { wsfe, crear, avanzar } = preparar();
    const parametros = crear();
    await parametros.monedas();

    avanzar(-1);
    await parametros.monedas();

    expect(wsfe.llamadas).toBe(2);
  });

  it('usa lo guardado aunque esté vencido si ARCA no responde', async () => {
    const { wsfe, crear, avanzar } = preparar();
    const parametros = crear();
    await parametros.monedas();

    avanzar(48);
    wsfe.respuestas.push(new Error('sin red'));

    expect(await cantidad(parametros.monedas())).toBe(49);
  });

  it('devuelve el error si ARCA no responde y no hay nada guardado', async () => {
    const { wsfe, crear } = preparar();
    wsfe.respuestas.push(new Error('sin red'));

    expect(await crear().monedas()).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
  });

  it('devuelve el error si no consigue ticket', async () => {
    const { tickets, wsfe, crear } = preparar();
    tickets.sinTicket = true;

    expect(await crear().monedas()).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
    expect(wsfe.llamadas).toBe(0);
  });

  it('pide otro ticket y reintenta una vez si ARCA rechaza el token', async () => {
    const { tickets, wsfe, crear } = preparar();
    wsfe.respuestas.push(tokenInvalido);

    expect(await cantidad(crear().monedas())).toBe(49);
    expect(tickets.invalidaciones).toBe(1);
    expect(wsfe.llamadas).toBe(2);
  });

  it('no reintenta más de una vez', async () => {
    const { tickets, wsfe, crear } = preparar();
    wsfe.respuestas.push(tokenInvalido, tokenInvalido);

    const resultado = await crear().monedas();

    expect(resultado.ok).toBe(false);
    expect(tickets.invalidaciones).toBe(1);
    expect(wsfe.llamadas).toBe(2);
  });

  it('no pide otro ticket por errores que no son del token', async () => {
    const { tickets, crear, wsfe } = preparar();
    wsfe.respuestas.push(rechazo(501, 'Error interno'));

    expect(await crear().monedas()).toEqual({
      ok: false,
      error: { tipo: 'rechazo_wsfe', errores: [{ codigo: 501, mensaje: 'Error interno' }] },
    });
    expect(tickets.invalidaciones).toBe(0);
  });

  it('olvida lo guardado y vuelve a consultar', async () => {
    const { almacen, wsfe, crear } = preparar();
    const parametros = crear();
    await parametros.monedas();

    await parametros.olvidar();

    await expect(almacen.leer(CLAVE)).resolves.toBeUndefined();
    await parametros.monedas();
    expect(wsfe.llamadas).toBe(2);
  });

  it.each([
    ['no es JSON', 'basura'],
    ['no tiene lista', '{"consultado":"2026-10-26T12:00:00.000Z","valor":3}'],
    ['tiene una fecha inválida', '{"consultado":"ayer","valor":[]}'],
  ])('vuelve a consultar si lo guardado %s', async (_, guardado) => {
    const { almacen, wsfe, crear } = preparar();
    await almacen.guardar(CLAVE, guardado);

    expect(await cantidad(crear().monedas())).toBe(49);
    expect(wsfe.llamadas).toBe(1);
  });

  it('sigue funcionando si el almacén falla', async () => {
    const roto: AlmacenLocal = {
      leer: () => Promise.reject(new Error('disco lleno')),
      guardar: () => Promise.reject(new Error('disco lleno')),
      borrar: () => Promise.resolve(),
    };
    const { wsfe, crear } = preparar(roto);
    const parametros = crear();

    expect(await cantidad(parametros.monedas())).toBe(49);
    expect(await cantidad(parametros.monedas())).toBe(49);
    expect(wsfe.llamadas).toBe(1);
  });

  it('guarda cada tabla por separado', async () => {
    const { wsfe, crear } = preparar();
    const parametros = crear();
    wsfe.respuestas.push(
      grabacion('tiposDeComprobante'),
      grabacion('alicuotasDeIva'),
      grabacion('puntosDeVentaSinResultados'),
      grabacion('condicionesIvaReceptor'),
    );

    expect(await cantidad(parametros.tiposDeComprobante())).toBe(36);
    expect(await cantidad(parametros.alicuotasDeIva())).toBe(6);
    expect(await cantidad(parametros.puntosDeVenta())).toBe(0);
    expect(await cantidad(parametros.condicionesIvaReceptor())).toBe(11);
    expect(await cantidad(parametros.tiposDeComprobante())).toBe(36);
    expect(wsfe.llamadas).toBe(4);
  });
});
