import {
  AlicuotaIva,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  CondicionIvaReceptor,
  Cuit,
  exito,
  fallo,
  FechaCalendario,
  TipoComprobante,
  type Comprobante,
  type Receptor,
  type Resultado,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import {
  crearReceptoresFrecuentes,
  type ReceptoresFrecuentes,
} from '../receptores/receptoresFrecuentes';
import { crearEmision, type AutorizadorDeComprobantes } from './emision';
import { prepararFactura } from './prepararFactura';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const cuit = valor(Cuit.crear('30712345671'));
const conCuit: Receptor = {
  identificacion: { tipo: 'cuit', cuit },
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  nombre: 'Ferretería Sur',
  domicilio: 'Belgrano 123, Rosario',
};

const comprobante = valor(
  prepararFactura({
    tipo: TipoComprobante.FACTURA_A,
    receptor: conCuit,
    modoDePrecio: 'final',
    items: [
      { descripcion: 'Tornillos', cantidad: '', precio: '1.210', alicuota: AlicuotaIva.VEINTIUNO },
    ],
    hoy: valor(FechaCalendario.crear(2026, 10, 27)),
  }),
);

/** Autorizador de prueba que registra lo que recibe y responde lo que se le indique. */
function autorizadorQue(respuesta: Resultado<string, string>) {
  const pedidos: { comprobante: Comprobante; puntoDeVenta: number }[] = [];
  const autorizador: AutorizadorDeComprobantes<string, string> = {
    autorizar: (recibido, puntoDeVenta) => {
      pedidos.push({ comprobante: recibido, puntoDeVenta });
      return Promise.resolve(respuesta);
    },
  };
  return { autorizador, pedidos };
}

describe('crearEmision', () => {
  it('pide la autorización con el punto de venta configurado y devuelve el resultado', async () => {
    const { autorizador, pedidos } = autorizadorQue(exito('CAE 12345678901234'));
    const emision = crearEmision({
      autorizador,
      receptoresFrecuentes: crearReceptoresFrecuentes(new AlmacenEnMemoria()),
      puntoDeVenta: 3,
    });

    await expect(emision.emitir(comprobante, conCuit)).resolves.toEqual(
      exito('CAE 12345678901234'),
    );
    expect(pedidos).toEqual([{ comprobante, puntoDeVenta: 3 }]);
  });

  it('si ARCA autoriza, recuerda al receptor con CUIT', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria());
    const emision = crearEmision({
      autorizador: autorizadorQue(exito('ok')).autorizador,
      receptoresFrecuentes: frecuentes,
      puntoDeVenta: 1,
    });

    await emision.emitir(comprobante, conCuit);

    const [recordado] = await frecuentes.listar();
    expect(recordado?.cuit.valor).toBe('30712345671');
    expect(recordado?.nombre).toBe('Ferretería Sur');
    expect(recordado?.domicilio).toBe('Belgrano 123, Rosario');
  });

  it('si ARCA rechaza, no lo recuerda', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria());
    const emision = crearEmision({
      autorizador: autorizadorQue(fallo('rechazado')).autorizador,
      receptoresFrecuentes: frecuentes,
      puntoDeVenta: 1,
    });

    await expect(emision.emitir(comprobante, conCuit)).resolves.toEqual(fallo('rechazado'));
    expect(await frecuentes.listar()).toEqual([]);
  });

  it('al consumidor final sin identificar no hay nada que recordar', async () => {
    const frecuentes = crearReceptoresFrecuentes(new AlmacenEnMemoria());
    const emision = crearEmision({
      autorizador: autorizadorQue(exito('ok')).autorizador,
      receptoresFrecuentes: frecuentes,
      puntoDeVenta: 1,
    });

    await emision.emitir(comprobante, CONSUMIDOR_FINAL_SIN_IDENTIFICAR);

    expect(await frecuentes.listar()).toEqual([]);
  });

  it('si no se puede recordar al receptor, la emisión igual sale bien', async () => {
    const roto: ReceptoresFrecuentes = {
      listar: () => Promise.resolve([]),
      registrarUso: () => Promise.reject(new Error('bloqueado')),
    };
    const emision = crearEmision({
      autorizador: autorizadorQue(exito('ok')).autorizador,
      receptoresFrecuentes: roto,
      puntoDeVenta: 1,
    });

    await expect(emision.emitir(comprobante, conCuit)).resolves.toEqual(exito('ok'));
  });
});
