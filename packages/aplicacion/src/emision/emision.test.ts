import {
  AlicuotaIva,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  CondicionIvaReceptor,
  Cuit,
  Emisor,
  exito,
  fallo,
  FechaCalendario,
  TipoComprobante,
  type Comprobante,
  type Receptor,
  type Resultado,
  UnidadDeMedida,
} from '@facturador/dominio';
import { describe, expect, it } from 'vitest';

import {
  crearRepositorioDeComprobantes,
  type RepositorioDeComprobantes,
} from '../comprobantes/comprobantesEmitidos';
import { crearBaseSqliteDePrueba } from '../persistencia/baseSqliteDePrueba';
import { migrar } from '../persistencia/migraciones';
import { AlmacenEnMemoria } from '../puertos/almacenEnMemoria';
import type { Registro } from '../registro/registro';
import {
  crearReceptoresFrecuentes,
  type ReceptoresFrecuentes,
} from '../receptores/receptoresFrecuentes';
import {
  crearEmision,
  type AutorizadorDeComprobantes,
  type ComprobanteNumerado,
  type DependenciasDeEmision,
} from './emision';
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
      {
        descripcion: 'Tornillos',
        cantidad: '',
        unidad: UnidadDeMedida.UNIDADES,
        precio: '1.210',
        alicuota: AlicuotaIva.VEINTIUNO,
      },
    ],
    hoy: valor(FechaCalendario.crear(2026, 10, 27)),
  }),
);

const emisor = valor(
  Emisor.crear({
    razonSocial: 'Juana Pérez',
    cuit: valor(Cuit.crear('20111111112')),
    condicion: 'responsable_inscripto',
    domicilio: 'Mitre 100, Rosario',
    inicioDeActividades: valor(FechaCalendario.crear(2020, 1, 1)),
    puntoDeVenta: 3,
  }),
);
const autorizado: ComprobanteNumerado = {
  comprobante: valor(
    comprobante.autorizar('76431234567890', valor(FechaCalendario.crear(2026, 11, 6))),
  ),
  puntoDeVenta: 3,
  numero: 12,
};

/** Autorizador de prueba que registra lo que recibe y responde lo que se le indique. */
function autorizadorQue(respuesta: Resultado<ComprobanteNumerado, string>) {
  const pedidos: { comprobante: Comprobante; puntoDeVenta: number }[] = [];
  const autorizador: AutorizadorDeComprobantes<ComprobanteNumerado, string> = {
    autorizar: (recibido, puntoDeVenta) => {
      pedidos.push({ comprobante: recibido, puntoDeVenta });
      return Promise.resolve(respuesta);
    },
  };
  return { autorizador, pedidos };
}

/** Registro de prueba que junta los errores. */
function registroDePrueba() {
  const errores: string[] = [];
  const registro: Registro = {
    depurar: () => undefined,
    error: (mensaje) => {
      errores.push(mensaje);
    },
  };
  return { registro, errores };
}

async function comprobantesEnBase() {
  const base = crearBaseSqliteDePrueba();
  await migrar(base);
  return crearRepositorioDeComprobantes(base);
}

async function emisionCon(
  respuesta: Resultado<ComprobanteNumerado, string>,
  cambios: Partial<DependenciasDeEmision<ComprobanteNumerado, string>> = {},
) {
  const { autorizador, pedidos } = autorizadorQue(respuesta);
  const { registro, errores } = registroDePrueba();
  const dependencias: DependenciasDeEmision<ComprobanteNumerado, string> = {
    autorizador,
    comprobantes: await comprobantesEnBase(),
    receptoresFrecuentes: crearReceptoresFrecuentes(new AlmacenEnMemoria()),
    registro,
    ambiente: 'homologacion',
    emisor,
    puntoDeVenta: 3,
    ...cambios,
  };
  return { emision: crearEmision(dependencias), dependencias, pedidos, errores };
}

const listarGuardados = (comprobantes: RepositorioDeComprobantes) =>
  comprobantes.listar({ ambiente: 'homologacion', emisor, limite: 10 });

describe('crearEmision', () => {
  it('pide la autorización con el punto de venta configurado y devuelve el resultado', async () => {
    const { emision, pedidos } = await emisionCon(exito(autorizado));

    await expect(emision.emitir(comprobante, conCuit)).resolves.toEqual(exito(autorizado));
    expect(pedidos).toEqual([{ comprobante, puntoDeVenta: 3 }]);
  });

  it('si ARCA autoriza, guarda el comprobante con su receptor', async () => {
    const { emision, dependencias } = await emisionCon(exito(autorizado));

    await emision.emitir(comprobante, conCuit);

    expect(await listarGuardados(dependencias.comprobantes)).toEqual([
      { ambiente: 'homologacion', emisor, ...autorizado, receptor: conCuit },
    ]);
  });

  it('si no se puede guardar, la emisión igual sale bien y queda registrado', async () => {
    const roto: RepositorioDeComprobantes = {
      guardar: () => Promise.reject(new Error('base bloqueada')),
      listar: () => Promise.resolve([]),
      leer: () => Promise.resolve(undefined),
      notasDeCreditoDe: () => Promise.resolve([]),
    };
    const { emision, errores } = await emisionCon(exito(autorizado), { comprobantes: roto });

    await expect(emision.emitir(comprobante, conCuit)).resolves.toEqual(exito(autorizado));
    expect(errores).toEqual(['no se pudo guardar el comprobante emitido']);
  });

  it('si ARCA autoriza, recuerda al receptor con CUIT', async () => {
    const { emision, dependencias } = await emisionCon(exito(autorizado));

    await emision.emitir(comprobante, conCuit);

    const [recordado] = await dependencias.receptoresFrecuentes.listar();
    expect(recordado?.cuit.valor).toBe('30712345671');
    expect(recordado?.nombre).toBe('Ferretería Sur');
    expect(recordado?.domicilio).toBe('Belgrano 123, Rosario');
  });

  it('si ARCA rechaza, no guarda nada ni recuerda al receptor', async () => {
    const { emision, dependencias } = await emisionCon(fallo('rechazado'));

    await expect(emision.emitir(comprobante, conCuit)).resolves.toEqual(fallo('rechazado'));
    expect(await listarGuardados(dependencias.comprobantes)).toEqual([]);
    expect(await dependencias.receptoresFrecuentes.listar()).toEqual([]);
  });

  it('al consumidor final sin identificar no hay nada que recordar', async () => {
    const { emision, dependencias } = await emisionCon(exito(autorizado));

    await emision.emitir(comprobante, CONSUMIDOR_FINAL_SIN_IDENTIFICAR);

    expect(await dependencias.receptoresFrecuentes.listar()).toEqual([]);
  });

  it('si no se puede recordar al receptor, la emisión igual sale bien', async () => {
    const roto: ReceptoresFrecuentes = {
      listar: () => Promise.resolve([]),
      registrarUso: () => Promise.reject(new Error('bloqueado')),
    };
    const { emision } = await emisionCon(exito(autorizado), { receptoresFrecuentes: roto });

    await expect(emision.emitir(comprobante, conCuit)).resolves.toEqual(exito(autorizado));
  });
});
