import { AlmacenEnMemoria } from '@facturador/aplicacion';
import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  FechaCalendario,
  SIN_IDENTIFICAR,
  TipoComprobante,
  type Resultado,
} from '@facturador/dominio';
import { beforeAll, describe, expect, it } from 'vitest';

import { URLS } from '../ambiente';
import { crearCertificadoDePrueba, crearFirmadorDePrueba } from '../criptografia/paraPruebas';
import { crearProveedorDeTickets, type ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import { crearAutorizadorWsfe } from '../wsfe/autorizadorWsfe';
import { consultarPadron } from '../padron/padron';
import { consultarComprobante } from '../wsfe/cae';
import { crearConsultaDeEmitidos } from '../wsfe/consultaDeEmitidos';
import { crearParametrosWsfe } from '../wsfe/parametrosWsfe';
import { verificarAlta } from '../wsfe/verificacionDelAlta';
import { crearDobleDeArca } from './dobleDeArca';

const valor = <T>(resultado: Resultado<T, unknown>): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const cuit = valor(Cuit.crear('20123456786'));
const ahora = new Date('2026-10-27T12:00:00Z');

const factura = (tipo = TipoComprobante.FACTURA_B) =>
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
          precioUnitario: valor(Dinero.desdeTexto('1.210')),
          ...(tipo.clase !== 'C' && { alicuota: AlicuotaIva.VEINTIUNO }),
        },
      ],
      fechaDeEmision: FechaCalendario.enArgentina(ahora),
      concepto: 'productos',
    }),
  );

let certificado: Uint8Array;
let firmador: ReturnType<typeof crearFirmadorDePrueba>['firmador'];

beforeAll(async () => {
  firmador = crearFirmadorDePrueba().firmador;
  certificado = await crearCertificadoDePrueba(firmador);
});

function preparar({ conOtroDispositivo = false } = {}) {
  const transporte = crearDobleDeArca({ ahora: () => ahora, conOtroDispositivo });
  const tickets: ProveedorDeTickets = crearProveedorDeTickets({
    ambiente: 'homologacion',
    cuit,
    servicio: 'wsfe',
    certificado,
    firmador,
    transporte,
    almacen: new AlmacenEnMemoria(),
    reloj: () => ahora,
  });
  const autorizador = crearAutorizadorWsfe({
    ambiente: 'homologacion',
    cuit,
    tickets,
    transporte,
    almacen: new AlmacenEnMemoria(),
  });
  return { transporte, tickets, autorizador };
}

describe('crearDobleDeArca', () => {
  it('deja verificar el alta', async () => {
    const { transporte, tickets } = preparar();

    const verificada = await verificarAlta({
      ambiente: 'homologacion',
      cuit,
      puntoDeVenta: 1,
      tickets,
      transporte,
    });

    expect(verificada.ok).toBe(true);
  });

  it('autoriza con números correlativos por tipo de comprobante', async () => {
    const { autorizador } = preparar();

    const primera = valor(await autorizador.autorizar(factura(), 1));
    const segunda = valor(await autorizador.autorizar(factura(), 1));
    const otroTipo = valor(await autorizador.autorizar(factura(TipoComprobante.FACTURA_C), 1));

    expect([primera.numero, segunda.numero, otroTipo.numero]).toEqual([1, 2, 1]);
    expect(primera.comprobante.autorizacion?.cae).toMatch(/^\d{14}$/);
    expect(primera.comprobante.autorizacion?.cae).not.toBe(segunda.comprobante.autorizacion?.cae);
  });

  it('informa lo autorizado al consultarlo', async () => {
    const { autorizador, tickets, transporte } = preparar();
    const otorgado = valor(await autorizador.autorizar(factura(), 1));
    const ticket = valor(await tickets.obtener());

    const consultado = valor(
      await consultarComprobante(
        { ticket, cuit },
        1,
        TipoComprobante.FACTURA_B,
        1,
        transporte,
        URLS.homologacion.wsfe,
      ),
    );

    expect(consultado?.numero).toBe(otorgado.numero);
    expect(consultado?.totalEnCentavos).toBe(121_000);
  });

  it('en el padrón, todo CUIT es un responsable inscripto', async () => {
    const { tickets, transporte } = preparar();
    const consultado = valor(Cuit.crear('27333333339'));

    const contribuyente = valor(
      await consultarPadron({ ambiente: 'homologacion', cuit, tickets, transporte }, consultado),
    );

    expect(contribuyente).toEqual({
      nombre: 'CLIENTE INSCRIPTO SA',
      domicilio: 'CALLE FALSA 123, ROSARIO, SANTA FE',
      condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
      activo: true,
    });
  });

  it('no responde a otros servicios', async () => {
    const transporte = crearDobleDeArca();

    const respuesta = await transporte(URLS.produccion.wsfe, {
      encabezados: {},
      cuerpo: '<Envelope><Body><FEDummy/></Body></Envelope>',
    });

    expect(respuesta.estado).toBe(404);
  });
});

describe('crearDobleDeArca con otro dispositivo', () => {
  it('informa dos puntos de venta y la factura que emitió el otro', async () => {
    const { tickets, transporte } = preparar({ conOtroDispositivo: true });
    const config = { ambiente: 'homologacion' as const, cuit, tickets, transporte };
    const parametros = crearParametrosWsfe({ ...config, almacen: new AlmacenEnMemoria() });
    const consulta = crearConsultaDeEmitidos(config);

    expect(valor(await parametros.puntosDeVenta()).map((p) => p.numero)).toEqual([1, 2]);
    expect(valor(await consulta.ultimo(2, TipoComprobante.FACTURA_B))).toBe(1);
    expect(valor(await consulta.leer(2, TipoComprobante.FACTURA_B, 1))).toMatchObject({
      totalEnCentavos: 24_200,
      netoEnCentavos: 20_000,
      ivaEnCentavos: 4_200,
      cae: '70000000009999',
    });
  });

  it('sin la opción no informa puntos de venta', async () => {
    const { tickets, transporte } = preparar();
    const parametros = crearParametrosWsfe({
      ambiente: 'homologacion',
      cuit,
      tickets,
      transporte,
      almacen: new AlmacenEnMemoria(),
    });

    expect(valor(await parametros.puntosDeVenta())).toEqual([]);
  });
});
