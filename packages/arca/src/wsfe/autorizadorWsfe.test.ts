import { readFileSync } from 'node:fs';

import { AlmacenEnMemoria, type AlmacenSeguro } from '@facturador/aplicacion';
import {
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  FechaCalendario,
  SIN_IDENTIFICAR,
  TipoComprobante,
  exito,
  fallo,
  type Resultado,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import { crearAutorizadorWsfe } from './autorizadorWsfe';

const grabacion = (nombre: string) =>
  readFileSync(new URL(`./grabaciones/${nombre}.xml`, import.meta.url), 'utf8');

const valor = <T>(resultado: Resultado<T, unknown>): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const cuit = valor(Cuit.crear('20123456786'));

const facturaC = (tipo = TipoComprobante.FACTURA_C, precio = '1.000') =>
  valor(
    Comprobante.crear({
      tipo,
      receptor: CondicionIvaReceptor.CONSUMIDOR_FINAL,
      identificacionReceptor: SIN_IDENTIFICAR,
      modoDePrecio: 'final',
      items: [
        {
          descripcion: 'Producto',
          cantidad: Cantidad.UNO,
          precioUnitario: valor(Dinero.desdeTexto(precio)),
        },
      ],
      fechaDeEmision: valor(FechaCalendario.crear(2026, 10, 27)),
      concepto: 'productos',
    }),
  );

const CLAVE_PENDIENTE = 'cae.pendiente.homologacion.20123456786.1.11';

/**
 * Cómo falla la próxima llamada a un método: sin llegar a ARCA, o después de que ARCA la procesó
 * sin que vuelva la respuesta, por un corte de red o un proxy que responde con una página de error.
 */
type Falla = 'antes' | 'despues' | 'despues_con_error_http';

/** Simula WSFEv1: numera, guarda lo autorizado y responde con la forma de las grabaciones. */
function crearArca() {
  function procesar(metodo: string, cuerpo: string): string {
    if (metodo === 'FECompUltimoAutorizado') {
      return grabacion('ultimoAutorizado').replace(
        '<CbteNro>1<',
        `<CbteNro>${String(arca.ultimo)}<`,
      );
    }
    const numero = Number(/<(?:CbteDesde|CbteNro)>(\d+)</.exec(cuerpo)?.[1]);
    if (metodo === 'FECompConsultar') {
      const total = arca.autorizados.get(numero);
      return total === undefined
        ? grabacion('consultaSinResultados')
        : grabacion('consultaFacturaC')
            .replaceAll(/<(CbteDesde|CbteHasta)>1</g, `<$1>${String(numero)}<`)
            .replace('<ImpTotal>1000<', `<ImpTotal>${total}<`);
    }
    if (numero !== arca.ultimo + 1) return grabacion('caeRechazado');
    arca.ultimo = numero;
    arca.autorizados.set(numero, /<ImpTotal>([\d.]+)</.exec(cuerpo)?.[1] ?? '');
    return grabacion('caeFacturaC').replaceAll(
      /<(CbteDesde|CbteHasta)>1</g,
      `<$1>${String(numero)}<`,
    );
  }

  const arca = {
    ultimo: 0,
    /** Total informado de cada número autorizado. */
    autorizados: new Map<number, string>(),
    metodos: [] as string[],
    /** Respuestas programadas para las próximas llamadas, antes de la simulación. */
    respuestas: [] as string[],
    /** Cantidad de llamadas que fallan por falta de red. */
    sinRed: 0,
    fallas: new Map<string, Falla>(),
    transporte: ((_, { encabezados, cuerpo }) => {
      if (arca.sinRed > 0) {
        arca.sinRed--;
        return Promise.reject(new Error('sin red'));
      }
      const metodo = (encabezados['SOAPAction'] ?? '').replace(/^"http:\/\/[^/]+\/|"$/g, '');
      arca.metodos.push(metodo);
      const programada = arca.respuestas.shift();
      if (programada) return Promise.resolve({ estado: 200, cuerpo: programada });

      const falla = arca.fallas.get(metodo);
      arca.fallas.delete(metodo);
      if (falla === 'antes') return Promise.reject(new Error('sin red'));
      const respuesta = procesar(metodo, cuerpo);
      if (falla === 'despues') return Promise.reject(new Error('se cortó'));
      if (falla === 'despues_con_error_http') {
        return Promise.resolve({ estado: 502, cuerpo: '<html>Bad Gateway</html>' });
      }
      return Promise.resolve({ estado: 200, cuerpo: respuesta });
    }) as Transporte,
  };
  return arca;
}

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

function preparar(almacen: AlmacenSeguro = new AlmacenEnMemoria()) {
  const arca = crearArca();
  const tickets = crearTickets();
  const crear = () =>
    crearAutorizadorWsfe({
      ambiente: 'homologacion',
      cuit,
      tickets: tickets.proveedor,
      transporte: arca.transporte,
      almacen,
    });
  return { arca, tickets, almacen, crear, autorizador: crear() };
}

/**
 * Prepara el próximo pedido para que quede incierto: ARCA autoriza (o no recibe) el comprobante,
 * la respuesta se pierde y la verificación inmediata tampoco tiene red.
 */
function cortarElProximoEnvio({ arca }: ReturnType<typeof preparar>, falla: Falla = 'despues') {
  arca.respuestas.push(grabacion('ultimoAutorizadoSinComprobantes'));
  arca.fallas.set('FECAESolicitar', falla);
  arca.fallas.set('FECompUltimoAutorizado', 'antes');
}

async function dejarIncierto(preparado: ReturnType<typeof preparar>, falla?: Falla) {
  cortarElProximoEnvio(preparado, falla);
  expect(tipo(await preparado.autorizador.autorizar(facturaC(), 1))).toBe('resultado_incierto');
}

const numero = (resultado: Resultado<{ numero: number }, unknown>) =>
  resultado.ok ? resultado.valor.numero : undefined;

const tipo = (resultado: Resultado<unknown, { readonly tipo: string }>) =>
  resultado.ok ? 'aprobado' : resultado.error.tipo;

describe('crearAutorizadorWsfe', () => {
  it('numera con el siguiente al último autorizado', async () => {
    const { arca, autorizador } = preparar();
    arca.ultimo = 41;

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(numero(resultado)).toBe(42);
    expect(resultado.ok && resultado.valor.comprobante.estaAutorizado()).toBe(true);
    expect(arca.metodos).toEqual(['FECompUltimoAutorizado', 'FECAESolicitar']);
  });

  it('atiende los pedidos simultáneos de a uno para no repetir números', async () => {
    const { autorizador } = preparar();

    const resultados = await Promise.all([1, 2, 3].map(() => autorizador.autorizar(facturaC(), 1)));

    expect(resultados.map(numero)).toEqual([1, 2, 3]);
  });

  it('dos autorizadores simultáneos para el mismo punto de venta no repiten números', async () => {
    const { arca, crear } = preparar();

    const resultados = await Promise.all([
      crear().autorizar(facturaC(), 1),
      crear().autorizar(facturaC(TipoComprobante.FACTURA_C, '500'), 1),
    ]);

    expect(resultados.map(numero)).toEqual([1, 2]);
    expect(arca.autorizados.size).toBe(2);
  });

  it('sigue atendiendo después de un pedido que falla', async () => {
    const { arca, autorizador } = preparar();
    arca.sinRed = 1;

    const [primero, segundo] = await Promise.all([
      autorizador.autorizar(facturaC(), 1),
      autorizador.autorizar(facturaC(), 1),
    ]);

    expect(primero).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
    expect(numero(segundo)).toBe(1);
  });

  it('pide otro ticket y reintenta si ARCA rechaza el token al pedir el CAE', async () => {
    const { arca, tickets, almacen, autorizador } = preparar();
    arca.respuestas.push(
      grabacion('ultimoAutorizadoSinComprobantes'),
      grabacion('caeTokenInvalido'),
    );

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(numero(resultado)).toBe(1);
    expect(tickets.invalidaciones).toBe(1);
    expect(arca.metodos).toEqual(['FECompUltimoAutorizado', 'FECAESolicitar', 'FECAESolicitar']);
    await expect(almacen.leer(CLAVE_PENDIENTE)).resolves.toBeUndefined();
  });

  it('pide otro ticket y reintenta si ARCA rechaza el token al consultar el último', async () => {
    const { arca, tickets, autorizador } = preparar();
    arca.respuestas.push(grabacion('ultimoAutorizadoTokenInvalido'));

    expect(numero(await autorizador.autorizar(facturaC(), 1))).toBe(1);
    expect(tickets.invalidaciones).toBe(1);
  });

  it('no reintenta un comprobante rechazado y borra el pendiente', async () => {
    const { arca, tickets, almacen, autorizador } = preparar();
    arca.respuestas.push(grabacion('ultimoAutorizadoSinComprobantes'), grabacion('caeRechazado'));

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(tipo(resultado)).toBe('comprobante_rechazado');
    expect(tickets.invalidaciones).toBe(0);
    expect(arca.metodos).toHaveLength(2);
    await expect(almacen.leer(CLAVE_PENDIENTE)).resolves.toBeUndefined();
  });

  it('no pide el CAE si no consigue el último número', async () => {
    const { arca, autorizador } = preparar();
    arca.respuestas.push(
      grabacion('ultimoAutorizadoTokenInvalido'),
      grabacion('ultimoAutorizadoTokenInvalido'),
    );

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(tipo(resultado)).toBe('rechazo_wsfe');
    expect(arca.metodos).toEqual(['FECompUltimoAutorizado', 'FECompUltimoAutorizado']);
  });

  it('devuelve el error si no consigue ticket', async () => {
    const { arca, tickets, autorizador } = preparar();
    tickets.sinTicket = true;

    expect(await autorizador.autorizar(facturaC(), 1)).toEqual({
      ok: false,
      error: { tipo: 'sin_conexion' },
    });
    expect(arca.metodos).toEqual([]);
  });

  it('no consulta a ARCA por un comprobante que no puede enviar', async () => {
    const { arca, autorizador } = preparar();

    const resultado = await autorizador.autorizar(facturaC(TipoComprobante.NOTA_DE_CREDITO_C), 1);

    expect(tipo(resultado)).toBe('comprobante_no_soportado');
    expect(arca.metodos).toEqual([]);
  });
});

describe('recuperación ante cortes', () => {
  it('recupera el CAE si la respuesta se perdió y la red vuelve enseguida', async () => {
    const { arca, almacen, autorizador } = preparar();
    arca.fallas.set('FECAESolicitar', 'despues');

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(numero(resultado)).toBe(1);
    expect(resultado.ok && resultado.valor.comprobante.autorizacion?.cae).toBe('86431024057662');
    expect(arca.metodos).toEqual([
      'FECompUltimoAutorizado',
      'FECAESolicitar',
      'FECompUltimoAutorizado',
      'FECompConsultar',
    ]);
    await expect(almacen.leer(CLAVE_PENDIENTE)).resolves.toBeUndefined();
  });

  it('trata un error HTTP después de enviar como un corte', async () => {
    const { arca, autorizador } = preparar();
    arca.fallas.set('FECAESolicitar', 'despues_con_error_http');

    expect(numero(await autorizador.autorizar(facturaC(), 1))).toBe(1);
    expect(arca.autorizados.size).toBe(1);
  });

  it('confirma que se puede reintentar si ARCA no recibió el comprobante', async () => {
    const { arca, almacen, autorizador } = preparar();
    arca.fallas.set('FECAESolicitar', 'antes');

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(resultado).toEqual({ ok: false, error: { tipo: 'sin_conexion' } });
    await expect(almacen.leer(CLAVE_PENDIENTE)).resolves.toBeUndefined();
    expect(numero(await autorizador.autorizar(facturaC(), 1))).toBe(1);
  });

  it('deja el comprobante pendiente si no puede confirmar qué pasó', async () => {
    const preparado = preparar();
    cortarElProximoEnvio(preparado);

    const resultado = await preparado.autorizador.autorizar(facturaC(), 1);

    expect(resultado).toEqual({
      ok: false,
      error: {
        tipo: 'resultado_incierto',
        puntoDeVenta: 1,
        numero: 1,
        causa: { tipo: 'sin_conexion' },
      },
    });
    expect(JSON.parse((await preparado.almacen.leer(CLAVE_PENDIENTE)) ?? '')).toEqual({
      numero: 1,
      huella: {
        fechaDeEmision: '20261027',
        totalEnCentavos: 100_000,
        codigoDeDocumento: 99,
        numeroDeDocumento: '0',
      },
    });
  });

  it.each([
    ['la misma instancia', false],
    ['otra instancia, como después de reiniciar la app', true],
  ])('al reintentar con %s devuelve el CAE sin emitir de nuevo', async (_, reiniciar) => {
    const preparado = preparar();
    await dejarIncierto(preparado);

    const autorizador = reiniciar ? preparado.crear() : preparado.autorizador;
    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(numero(resultado)).toBe(1);
    expect(preparado.arca.autorizados.size).toBe(1);
    expect(preparado.arca.metodos.filter((metodo) => metodo === 'FECAESolicitar')).toHaveLength(1);
    await expect(preparado.almacen.leer(CLAVE_PENDIENTE)).resolves.toBeUndefined();
  });

  it('emite normalmente si el pendiente nunca llegó a ARCA', async () => {
    const preparado = preparar();
    await dejarIncierto(preparado, 'antes');

    expect(numero(await preparado.autorizador.autorizar(facturaC(), 1))).toBe(1);
    expect(preparado.arca.autorizados.size).toBe(1);
  });

  it('no emite otro comprobante mientras el pendiente siga sin resolver', async () => {
    const preparado = preparar();
    await dejarIncierto(preparado);
    preparado.arca.sinRed = 1;

    const resultado = await preparado.autorizador.autorizar(
      facturaC(TipoComprobante.FACTURA_C, '500'),
      1,
    );

    expect(tipo(resultado)).toBe('resultado_incierto');
    expect(preparado.arca.autorizados.size).toBe(1);
  });

  it('avisa si el pendiente se autorizó y ahora se emite otro comprobante', async () => {
    const preparado = preparar();
    await dejarIncierto(preparado);
    const otro = facturaC(TipoComprobante.FACTURA_C, '500');

    const resultado = await preparado.autorizador.autorizar(otro, 1);

    expect(resultado.ok || resultado.error).toMatchObject({
      tipo: 'comprobante_anterior_autorizado',
      anterior: { numero: 1, cae: '86431024057662', totalEnCentavos: 100_000 },
    });
    await expect(preparado.almacen.leer(CLAVE_PENDIENTE)).resolves.toBeUndefined();
    expect(numero(await preparado.autorizador.autorizar(otro, 1))).toBe(2);
  });

  it('no confunde el pendiente con otro comprobante que tomó su número', async () => {
    const { arca, almacen, autorizador } = preparar();
    arca.ultimo = 1;
    arca.autorizados.set(1, '500.00');
    await almacen.guardar(
      CLAVE_PENDIENTE,
      JSON.stringify({
        numero: 1,
        huella: {
          fechaDeEmision: '20261027',
          totalEnCentavos: 100_000,
          codigoDeDocumento: 99,
          numeroDeDocumento: '0',
        },
      }),
    );

    expect(numero(await autorizador.autorizar(facturaC(), 1))).toBe(2);
  });

  it.each(['basura', '{"numero":"uno"}'])('ignora un pendiente ilegible: %s', async (guardado) => {
    const { almacen, autorizador } = preparar();
    await almacen.guardar(CLAVE_PENDIENTE, guardado);

    expect(numero(await autorizador.autorizar(facturaC(), 1))).toBe(1);
  });

  it('no envía si no puede guardar el pendiente', async () => {
    const almacen = new AlmacenEnMemoria();
    almacen.guardar = () => Promise.reject(new Error('sin espacio'));
    const { arca, autorizador } = preparar(almacen);

    expect(tipo(await autorizador.autorizar(facturaC(), 1))).toBe('almacen_no_disponible');
    expect(arca.metodos).not.toContain('FECAESolicitar');
  });

  it('no envía si no puede leer los pendientes', async () => {
    const almacen = new AlmacenEnMemoria();
    almacen.leer = () => Promise.reject(new Error('bloqueado'));
    const { arca, autorizador } = preparar(almacen);

    expect(tipo(await autorizador.autorizar(facturaC(), 1))).toBe('almacen_no_disponible');
    expect(arca.metodos).toEqual([]);
  });

  it('si no puede borrar el pendiente, lo resuelve en el envío siguiente', async () => {
    const almacen = new AlmacenEnMemoria();
    const borrar = almacen.borrar.bind(almacen);
    almacen.borrar = () => Promise.reject(new Error('bloqueado'));
    const { autorizador } = preparar(almacen);
    expect(numero(await autorizador.autorizar(facturaC(), 1))).toBe(1);
    almacen.borrar = borrar;

    // El pendiente que quedó es el comprobante 1, ya registrado por la app: ARCA lo confirma.
    const resultado = await autorizador.autorizar(facturaC(TipoComprobante.FACTURA_C, '500'), 1);

    expect(tipo(resultado)).toBe('comprobante_anterior_autorizado');
  });
});
