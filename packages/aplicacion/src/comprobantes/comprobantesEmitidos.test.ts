import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Dni,
  FechaCalendario,
  TipoComprobante,
  type Receptor,
} from '@facturador/dominio';
import { beforeEach, describe, expect, it } from 'vitest';

import { crearBaseSqliteDePrueba } from '../persistencia/baseSqliteDePrueba';
import { migrar } from '../persistencia/migraciones';
import {
  crearRepositorioDeComprobantes,
  type ComprobanteEmitido,
  type RepositorioDeComprobantes,
} from './comprobantesEmitidos';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const fecha = (anio: number, mes: number, dia: number) =>
  valor(FechaCalendario.crear(anio, mes, dia));
const cuitEmisor = valor(Cuit.crear('20111111112'));
const otroEmisor = valor(Cuit.crear('27333333339'));

const ferreteria: Receptor = {
  identificacion: { tipo: 'cuit', cuit: valor(Cuit.crear('30712345671')) },
  condicion: CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  nombre: 'Ferretería Sur',
  domicilio: 'Belgrano 123, Rosario',
};

function autorizada(
  receptor: Receptor,
  opciones: { tipo?: TipoComprobante; hoy?: FechaCalendario; servicios?: boolean } = {},
): Comprobante {
  const hoy = opciones.hoy ?? fecha(2026, 10, 27);
  const preparado = valor(
    Comprobante.crear({
      tipo: opciones.tipo ?? TipoComprobante.FACTURA_A,
      receptor: receptor.condicion,
      identificacionReceptor: receptor.identificacion,
      modoDePrecio: 'final',
      items: [
        {
          descripcion: 'Tornillos',
          cantidad: valor(Cantidad.desdeTexto('2,5')),
          precioUnitario: valor(Dinero.desdeTexto('1.210,50')),
          alicuota: AlicuotaIva.VEINTIUNO,
        },
        {
          descripcion: 'Flete',
          cantidad: Cantidad.UNO,
          precioUnitario: valor(Dinero.desdeTexto('500')),
          alicuota: AlicuotaIva.DIEZ_Y_MEDIO,
        },
      ],
      fechaDeEmision: hoy,
      ...(opciones.servicios
        ? {
            concepto: 'servicios',
            periodoDeServicio: {
              desde: fecha(2026, 10, 1),
              hasta: fecha(2026, 10, 31),
              vencimientoDePago: fecha(2026, 11, 10),
            },
          }
        : { concepto: 'productos' }),
    }),
  );
  return valor(preparado.autorizar('76431234567890', hoy.sumarDias(10)));
}

const emitido = (
  numero: number,
  comprobante = autorizada(ferreteria),
  receptor = ferreteria,
): ComprobanteEmitido => ({
  ambiente: 'homologacion',
  cuitEmisor,
  puntoDeVenta: 3,
  numero,
  comprobante,
  receptor,
});

describe('RepositorioDeComprobantes', () => {
  let base: ReturnType<typeof crearBaseSqliteDePrueba>;
  let repositorio: RepositorioDeComprobantes;
  const listar = (limite = 10) =>
    repositorio.listar({ ambiente: 'homologacion', cuitEmisor, limite });

  beforeEach(async () => {
    base = crearBaseSqliteDePrueba();
    await migrar(base);
    repositorio = crearRepositorioDeComprobantes(base, () => 1_000);
  });

  it('guarda un comprobante autorizado y lo rearma igual', async () => {
    const original = emitido(12);

    await repositorio.guardar(original);
    const [leido] = await listar();

    expect(leido).toEqual(original);
    expect(leido?.comprobante.totales.total.esIgualA(original.comprobante.totales.total)).toBe(
      true,
    );
  });

  it('conserva el período de un comprobante de servicios', async () => {
    const original = emitido(13, autorizada(ferreteria, { servicios: true }));

    await repositorio.guardar(original);

    expect(await listar()).toEqual([original]);
  });

  it.each<[string, Receptor]>([
    ['un consumidor final sin identificar', CONSUMIDOR_FINAL_SIN_IDENTIFICAR],
    [
      'un receptor con DNI',
      {
        identificacion: { tipo: 'dni', dni: valor(Dni.crear('30123456')) },
        condicion: CondicionIvaReceptor.CONSUMIDOR_FINAL,
      },
    ],
  ])('guarda una factura B a %s', async (_, receptor) => {
    const original = emitido(
      14,
      autorizada(receptor, { tipo: TipoComprobante.FACTURA_B }),
      receptor,
    );

    await repositorio.guardar(original);

    expect(await listar()).toEqual([original]);
  });

  it('guardar dos veces el mismo comprobante no lo duplica', async () => {
    await repositorio.guardar(emitido(12));
    await repositorio.guardar(emitido(12));

    expect(await listar()).toHaveLength(1);
  });

  it('lista primero los más recientes, hasta el límite pedido', async () => {
    await repositorio.guardar(emitido(1, autorizada(ferreteria, { hoy: fecha(2026, 10, 20) })));
    await repositorio.guardar(emitido(3, autorizada(ferreteria, { hoy: fecha(2026, 10, 27) })));
    await repositorio.guardar(emitido(2, autorizada(ferreteria, { hoy: fecha(2026, 10, 25) })));

    const numeros = (await listar(2)).map((comprobante) => comprobante.numero);

    expect(numeros).toEqual([3, 2]);
  });

  it('separa los comprobantes por ambiente y por emisor', async () => {
    await repositorio.guardar(emitido(1));
    await repositorio.guardar({ ...emitido(2), ambiente: 'produccion' });
    await repositorio.guardar({ ...emitido(3), cuitEmisor: otroEmisor });

    expect((await listar()).map((comprobante) => comprobante.numero)).toEqual([1]);
  });

  it('rechaza un comprobante sin CAE', async () => {
    const { datos } = autorizada(ferreteria);
    const sinAutorizar = valor(Comprobante.crear(datos));

    await expect(repositorio.guardar(emitido(1, sinAutorizar))).rejects.toThrow();
    expect(await listar()).toEqual([]);
  });

  it('guarda las columnas para listar y buscar', async () => {
    await repositorio.guardar(emitido(12));

    expect(
      await base.consultar(
        'SELECT tipo, punto_de_venta, numero, fecha, total_en_centavos, receptor, cae, guardado_en FROM comprobantes',
      ),
    ).toEqual([
      {
        tipo: 1,
        punto_de_venta: 3,
        numero: 12,
        fecha: '20261027',
        total_en_centavos: 352625,
        receptor: 'Ferretería Sur',
        cae: '76431234567890',
        guardado_en: 1_000,
      },
    ]);
  });

  describe('con datos dañados', () => {
    const datosDe = async () =>
      String((await base.consultar('SELECT datos FROM comprobantes'))[0]?.['datos']);
    const reemplazarDatos = (datos: string) =>
      base.ejecutar('UPDATE comprobantes SET datos = ?', [datos]);

    beforeEach(async () => {
      await repositorio.guardar(emitido(12));
    });

    it.each<[string, (guardado: Record<string, unknown>) => unknown]>([
      ['otra versión', (g) => ({ ...g, version: 99 })],
      ['un tipo inexistente', (g) => ({ ...g, tipo: 999 })],
      ['un modo de precio inexistente', (g) => ({ ...g, modoDePrecio: 'otro' })],
      ['una fecha imposible', (g) => ({ ...g, fechaDeEmision: '20261399' })],
      ['un CAE inválido', (g) => ({ ...g, cae: 'abc' })],
      [
        'un ítem con cantidad cero',
        (g) => ({ ...g, items: [{ ...first(g), cantidadEnMilesimas: 0 }] }),
      ],
      [
        'un ítem con alícuota inexistente',
        (g) => ({ ...g, items: [{ ...first(g), alicuota: 77 }] }),
      ],
      ['un ítem sin descripción', (g) => ({ ...g, items: [{ ...first(g), descripcion: 5 }] })],
      ['un ítem que no es un objeto', (g) => ({ ...g, items: [null] })],
      ['un CUIT de receptor inválido', (g) => ({ ...g, receptor: { condicion: 1, cuit: '1' } })],
      ['un DNI inválido', (g) => ({ ...g, receptor: { condicion: 5, dni: 'x' } })],
      ['una condición inexistente', (g) => ({ ...g, receptor: { condicion: 99 } })],
      ['un período incompleto', (g) => ({ ...g, periodoDeServicio: { desde: '20261001' } })],
      ['algo que no es un objeto', () => 'texto'],
    ])('descarta un comprobante con %s', async (_, danar) => {
      await reemplazarDatos(
        JSON.stringify(danar(JSON.parse(await datosDe()) as Record<string, unknown>)),
      );

      expect(await listar()).toEqual([]);
    });

    it('descarta un texto que no es JSON', async () => {
      await reemplazarDatos('{');

      expect(await listar()).toEqual([]);
    });

    it('una fila dañada no tapa a las demás', async () => {
      await reemplazarDatos('{');
      await repositorio.guardar(emitido(13));

      expect((await listar()).map((comprobante) => comprobante.numero)).toEqual([13]);
    });
  });
});

const first = (guardado: Record<string, unknown>) =>
  (guardado['items'] as Record<string, unknown>[])[0];
