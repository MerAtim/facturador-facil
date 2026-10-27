import { readFileSync } from 'node:fs';

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

const facturaC = (tipo = TipoComprobante.FACTURA_C) =>
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
          precioUnitario: valor(Dinero.desdeTexto('1.000')),
        },
      ],
      fechaDeEmision: valor(FechaCalendario.crear(2026, 10, 27)),
      concepto: 'productos',
    }),
  );

/** Simula WSFEv1: lleva la cuenta de números y responde con la forma de las grabaciones. */
function crearArca() {
  const arca = {
    ultimo: 0,
    metodos: [] as string[],
    /** Respuestas programadas para las próximas llamadas, antes de la simulación. */
    respuestas: [] as string[],
    /** Cantidad de llamadas que fallan por falta de red. */
    sinRed: 0,
    transporte: ((_, { encabezados, cuerpo }) => {
      if (arca.sinRed > 0) {
        arca.sinRed--;
        return Promise.reject(new Error('sin red'));
      }
      const metodo = (encabezados['SOAPAction'] ?? '').replace(/^"http:\/\/[^/]+\/|"$/g, '');
      arca.metodos.push(metodo);
      const programada = arca.respuestas.shift();
      if (programada) return Promise.resolve({ estado: 200, cuerpo: programada });

      if (metodo === 'FECompUltimoAutorizado') {
        return Promise.resolve({
          estado: 200,
          cuerpo: grabacion('ultimoAutorizado').replace(
            '<CbteNro>1<',
            `<CbteNro>${String(arca.ultimo)}<`,
          ),
        });
      }
      const numero = Number(/<CbteDesde>(\d+)</.exec(cuerpo)?.[1]);
      if (numero !== arca.ultimo + 1) {
        return Promise.resolve({ estado: 200, cuerpo: grabacion('caeRechazado') });
      }
      arca.ultimo = numero;
      return Promise.resolve({
        estado: 200,
        cuerpo: grabacion('caeFacturaC').replaceAll(
          /<(CbteDesde|CbteHasta)>1</g,
          `<$1>${String(numero)}<`,
        ),
      });
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

function preparar() {
  const arca = crearArca();
  const tickets = crearTickets();
  const autorizador = crearAutorizadorWsfe({
    ambiente: 'homologacion',
    cuit,
    tickets: tickets.proveedor,
    transporte: arca.transporte,
  });
  return { arca, tickets, autorizador };
}

const numero = (resultado: Resultado<{ numero: number }, unknown>) =>
  resultado.ok ? resultado.valor.numero : undefined;

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
    const { arca, tickets, autorizador } = preparar();
    arca.respuestas.push(
      grabacion('ultimoAutorizadoSinComprobantes'),
      grabacion('caeTokenInvalido'),
    );

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(numero(resultado)).toBe(1);
    expect(tickets.invalidaciones).toBe(1);
    expect(arca.metodos).toEqual(['FECompUltimoAutorizado', 'FECAESolicitar', 'FECAESolicitar']);
  });

  it('pide otro ticket y reintenta si ARCA rechaza el token al consultar el último', async () => {
    const { arca, tickets, autorizador } = preparar();
    arca.respuestas.push(grabacion('ultimoAutorizadoTokenInvalido'));

    expect(numero(await autorizador.autorizar(facturaC(), 1))).toBe(1);
    expect(tickets.invalidaciones).toBe(1);
  });

  it('no reintenta un comprobante rechazado', async () => {
    const { arca, tickets, autorizador } = preparar();
    arca.respuestas.push(grabacion('ultimoAutorizadoSinComprobantes'), grabacion('caeRechazado'));

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(resultado.ok || resultado.error.tipo).toBe('comprobante_rechazado');
    expect(tickets.invalidaciones).toBe(0);
    expect(arca.metodos).toHaveLength(2);
  });

  it('no pide el CAE si no consigue el último número', async () => {
    const { arca, autorizador } = preparar();
    arca.respuestas.push(
      grabacion('ultimoAutorizadoTokenInvalido'),
      grabacion('ultimoAutorizadoTokenInvalido'),
    );

    const resultado = await autorizador.autorizar(facturaC(), 1);

    expect(resultado.ok || resultado.error.tipo).toBe('rechazo_wsfe');
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

    expect(resultado.ok || resultado.error.tipo).toBe('comprobante_no_soportado');
    expect(arca.metodos).toEqual([]);
  });
});
