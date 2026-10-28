import {
  AlicuotaIva,
  Cantidad,
  Comprobante,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  CondicionIvaReceptor,
  Cuit,
  Dinero,
  Dni,
  Emisor,
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
  type FiltroDeComprobantes,
  type RepositorioDeComprobantes,
} from './comprobantesEmitidos';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const fecha = (anio: number, mes: number, dia: number) =>
  valor(FechaCalendario.crear(anio, mes, dia));
const emisorCon = (cambios: { cuit?: string; domicilio?: string } = {}) =>
  valor(
    Emisor.crear({
      razonSocial: 'Juana Pérez',
      cuit: valor(Cuit.crear(cambios.cuit ?? '20111111112')),
      condicion: 'responsable_inscripto',
      domicilio: cambios.domicilio ?? 'Mitre 100, Rosario',
      inicioDeActividades: fecha(2020, 1, 1),
      puntoDeVenta: 3,
      ingresosBrutos: 'Exento',
    }),
  );
const emisor = emisorCon();
const otroEmisor = emisorCon({ cuit: '27333333339' });

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
  emisor,
  puntoDeVenta: 3,
  numero,
  comprobante,
  receptor,
});

describe('RepositorioDeComprobantes', () => {
  let base: ReturnType<typeof crearBaseSqliteDePrueba>;
  let repositorio: RepositorioDeComprobantes;
  const listar = (filtro: Partial<FiltroDeComprobantes> = {}) =>
    repositorio.listar({ ambiente: 'homologacion', emisor, limite: 10, ...filtro });
  const numeros = async (filtro: Partial<FiltroDeComprobantes> = {}) =>
    (await listar(filtro)).map((comprobante) => comprobante.numero);

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

    expect(await numeros({ limite: 2 })).toEqual([3, 2]);
  });

  it('separa los comprobantes por ambiente y por emisor', async () => {
    await repositorio.guardar(emitido(1));
    await repositorio.guardar({ ...emitido(2), ambiente: 'produccion' });
    await repositorio.guardar({ ...emitido(3), emisor: otroEmisor });

    expect(await numeros()).toEqual([1]);
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
        'SELECT tipo, punto_de_venta, numero, fecha, total_en_centavos, receptor, receptor_documento, cae, guardado_en FROM comprobantes',
      ),
    ).toEqual([
      {
        tipo: 1,
        punto_de_venta: 3,
        numero: 12,
        fecha: '20261027',
        total_en_centavos: 352625,
        receptor: 'Ferretería Sur',
        receptor_documento: '30712345671',
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
      ['un emisor con CUIT inválido', (g) => ({ ...g, emisor: { ...emisorDe(g), cuit: '1' } })],
      [
        'un emisor sin razón social',
        (g) => ({ ...g, emisor: { ...emisorDe(g), razonSocial: '' } }),
      ],
      [
        'un emisor con condición inexistente',
        (g) => ({ ...g, emisor: { ...emisorDe(g), condicion: 'x' } }),
      ],
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

      expect(await numeros()).toEqual([13]);
    });
  });

  it('conserva los datos del emisor al emitir aunque después cambien', async () => {
    await repositorio.guardar(emitido(12));

    const [leido] = await listar({ emisor: emisorCon({ domicilio: 'Otra calle 9' }) });

    expect(leido?.emisor.datos.domicilio).toBe('Mitre 100, Rosario');
  });

  it('lee lo guardado en la versión 1, sin emisor, con los datos del emisor actual', async () => {
    await repositorio.guardar(emitido(12));
    const guardado = JSON.parse(
      String((await base.consultar('SELECT datos FROM comprobantes'))[0]?.['datos']),
    ) as Record<string, unknown>;
    const version1: Record<string, unknown> = { ...guardado, version: 1 };
    delete version1['emisor'];
    await base.ejecutar('UPDATE comprobantes SET datos = ?', [JSON.stringify(version1)]);
    const actual = emisorCon({ domicilio: 'Otra calle 9' });

    const [leido] = await listar({ emisor: actual });

    expect(leido?.emisor).toBe(actual);
    expect(leido?.numero).toBe(12);
  });

  it('lee un comprobante por su tipo, punto de venta y número', async () => {
    await repositorio.guardar(emitido(12));
    await repositorio.guardar(emitido(13));
    const clave = {
      ambiente: 'homologacion' as const,
      emisor,
      tipo: TipoComprobante.FACTURA_A,
      puntoDeVenta: 3,
    };

    expect((await repositorio.leer({ ...clave, numero: 13 }))?.numero).toBe(13);
    expect(await repositorio.leer({ ...clave, numero: 14 })).toBeUndefined();
    expect(
      await repositorio.leer({ ...clave, tipo: TipoComprobante.FACTURA_B, numero: 13 }),
    ).toBeUndefined();
  });

  describe('buscar y filtrar', () => {
    const consumidor: Receptor = {
      identificacion: { tipo: 'dni', dni: valor(Dni.crear('30123456')) },
      condicion: CondicionIvaReceptor.CONSUMIDOR_FINAL,
      nombre: 'Ana_100%',
    };

    beforeEach(async () => {
      await repositorio.guardar(emitido(1, autorizada(ferreteria, { hoy: fecha(2026, 9, 15) })));
      await repositorio.guardar(
        emitido(
          2,
          autorizada(consumidor, { tipo: TipoComprobante.FACTURA_B, hoy: fecha(2026, 10, 2) }),
          consumidor,
        ),
      );
      await repositorio.guardar(
        emitido(
          3,
          autorizada(CONSUMIDOR_FINAL_SIN_IDENTIFICAR, {
            tipo: TipoComprobante.FACTURA_B,
            hoy: fecha(2026, 10, 20),
          }),
          CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
        ),
      );
    });

    it.each<[string, string, number[]]>([
      ['parte del nombre, sin importar mayúsculas', 'ferre', [1]],
      ['un comodín de LIKE como texto', '_100%', [2]],
      ['un guion bajo que no es comodín', 'r_a', []],
      ['parte del CUIT', '712345', [1]],
      ['el CUIT con guiones', '30-71234567-1', [1]],
      ['parte del DNI', '30123', [2]],
      ['el número', '3', [3]],
      ['punto de venta y número', '00003-00000002', [2]],
      ['el importe total', '3.526,25', [3, 2, 1]],
      ['algo que no está', 'nada', []],
      ['solo espacios, que no filtra', '   ', [3, 2, 1]],
    ])('busca por %s', async (_, busqueda, esperados) => {
      expect(await numeros({ busqueda })).toEqual(esperados);
    });

    it('filtra por fecha, con los extremos incluidos', async () => {
      expect(await numeros({ desde: fecha(2026, 10, 2) })).toEqual([3, 2]);
      expect(await numeros({ hasta: fecha(2026, 10, 2) })).toEqual([2, 1]);
      expect(await numeros({ desde: fecha(2026, 10, 1), hasta: fecha(2026, 10, 31) })).toEqual([
        3, 2,
      ]);
    });

    it('filtra por clase', async () => {
      expect(await numeros({ clase: 'A' })).toEqual([1]);
      expect(await numeros({ clase: 'B' })).toEqual([3, 2]);
      expect(await numeros({ clase: 'C' })).toEqual([]);
    });

    it('combina búsqueda y filtros', async () => {
      expect(
        await numeros({ busqueda: '3.526,25', clase: 'B', desde: fecha(2026, 10, 10) }),
      ).toEqual([3]);
    });
  });
});

const emisorDe = (guardado: Record<string, unknown>) =>
  guardado['emisor'] as Record<string, unknown>;

const first = (guardado: Record<string, unknown>) =>
  (guardado['items'] as Record<string, unknown>[])[0];
