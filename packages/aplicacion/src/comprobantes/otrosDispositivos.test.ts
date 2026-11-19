import { Cuit, Emisor, FechaCalendario, TipoComprobante } from '@facturador/dominio';
import { beforeEach, describe, expect, it } from 'vitest';

import { crearBaseSqliteDePrueba } from '../persistencia/baseSqliteDePrueba';
import { migrar } from '../persistencia/migraciones';
import {
  crearRepositorioDeOtrosDispositivos,
  traerDeOtrosDispositivos,
  type EmitidoEnOtroDispositivo,
  type FuenteDeEmitidos,
  type RepositorioDeOtrosDispositivos,
} from './otrosDispositivos';

const valor = <T>(resultado: { ok: true; valor: T } | { ok: false }): T => {
  if (!resultado.ok) throw new Error('Dato de prueba inválido');
  return resultado.valor;
};

const fecha = (dia: number) => valor(FechaCalendario.crear(2026, 11, dia));

const emisor = valor(
  Emisor.crear({
    razonSocial: 'Juana Pérez',
    cuit: valor(Cuit.crear('20111111112')),
    condicion: 'responsable_inscripto',
    domicilio: 'Mitre 100, Rosario',
    inicioDeActividades: valor(FechaCalendario.crear(2020, 1, 1)),
    puntoDeVenta: 3,
    ingresosBrutos: 'Exento',
  }),
);

type EnArca = Omit<EmitidoEnOtroDispositivo, 'ambiente'>;

const enArca = (
  tipo: TipoComprobante,
  puntoDeVenta: number,
  numero: number,
  dia = 10,
  total = 12_100,
): EnArca => ({
  tipo,
  puntoDeVenta,
  numero,
  fechaDeEmision: fecha(dia),
  totalEnCentavos: total,
  netoEnCentavos: Math.round(total / 1.21),
  ivaEnCentavos: total - Math.round(total / 1.21),
  documentoDelReceptor: '0',
  cae: '76431234567890',
  vencimientoDelCae: fecha(dia + 10),
});

/** Una ARCA en memoria con los comprobantes dados, que cuenta las consultas. */
function arcaCon(puntosDeVenta: readonly number[], comprobantes: readonly EnArca[]) {
  const consultas = { leer: 0 };
  const fuente: FuenteDeEmitidos = {
    puntosDeVenta: () => Promise.resolve(puntosDeVenta),
    ultimo: (puntoDeVenta, tipo) =>
      Promise.resolve(
        Math.max(
          0,
          ...comprobantes
            .filter((c) => c.puntoDeVenta === puntoDeVenta && c.tipo === tipo)
            .map((c) => c.numero),
        ),
      ),
    leer: (puntoDeVenta, tipo, numero) => {
      consultas.leer += 1;
      return Promise.resolve(
        comprobantes.find(
          (c) => c.puntoDeVenta === puntoDeVenta && c.tipo === tipo && c.numero === numero,
        ),
      );
    },
  };
  return { fuente, consultas };
}

describe('comprobantes de otros dispositivos', () => {
  let repositorio: RepositorioDeOtrosDispositivos;
  const traer = (fuente: FuenteDeEmitidos, maximo?: number) =>
    traerDeOtrosDispositivos({
      fuente,
      repositorio,
      ambiente: 'homologacion',
      emisor,
      ...(maximo !== undefined && { maximo }),
    });
  const listar = () => repositorio.listar({ ambiente: 'homologacion', emisor });

  beforeEach(async () => {
    const base = crearBaseSqliteDePrueba();
    await migrar(base);
    repositorio = crearRepositorioDeOtrosDispositivos(base);
  });

  it('trae los de los otros puntos de venta y no los del propio', async () => {
    const { fuente } = arcaCon(
      [3, 4],
      [enArca(TipoComprobante.FACTURA_B, 3, 1), enArca(TipoComprobante.FACTURA_B, 4, 1)],
    );

    expect(await traer(fuente)).toBe(1);
    expect((await listar()).map((c) => c.puntoDeVenta)).toEqual([4]);
  });

  it('en la pasada siguiente solo pide los nuevos', async () => {
    const comprobantes = [enArca(TipoComprobante.FACTURA_A, 4, 1)];
    await traer(arcaCon([4], comprobantes).fuente);

    const conUnoMas = arcaCon([4], [...comprobantes, enArca(TipoComprobante.FACTURA_A, 4, 2)]);
    expect(await traer(conUnoMas.fuente)).toBe(1);
    expect(conUnoMas.consultas.leer).toBe(1);
    expect((await listar()).map((c) => c.numero)).toEqual([2, 1]);
  });

  it('no pasa del máximo por pasada y sigue en la próxima', async () => {
    const muchos = [1, 2, 3].map((numero) => enArca(TipoComprobante.FACTURA_B, 4, numero));
    const { fuente } = arcaCon([4], muchos);

    expect(await traer(fuente, 2)).toBe(2);
    expect(await traer(fuente, 2)).toBe(1);
    expect(await listar()).toHaveLength(3);
  });

  it('solo consulta los tipos que el emisor puede emitir', async () => {
    const { fuente } = arcaCon([4], [enArca(TipoComprobante.FACTURA_C, 4, 1)]);

    expect(await traer(fuente)).toBe(0);
  });

  it('guarda lo que da ARCA y lo devuelve igual', async () => {
    await traer(arcaCon([4], [enArca(TipoComprobante.FACTURA_B, 4, 7, 12, 50_000)]).fuente);

    const [leido] = await listar();
    expect(leido).toMatchObject({
      ambiente: 'homologacion',
      tipo: TipoComprobante.FACTURA_B,
      puntoDeVenta: 4,
      numero: 7,
      totalEnCentavos: 50_000,
      documentoDelReceptor: '0',
      cae: '76431234567890',
    });
    expect(leido?.fechaDeEmision.formatear()).toBe('12/11/2026');
  });

  it('lee uno por su tipo, punto de venta y número', async () => {
    await traer(arcaCon([4], [enArca(TipoComprobante.FACTURA_B, 4, 7)]).fuente);

    const clave = { tipo: TipoComprobante.FACTURA_B, puntoDeVenta: 4 };
    expect((await repositorio.leer('homologacion', emisor, { ...clave, numero: 7 }))?.numero).toBe(
      7,
    );
    expect(await repositorio.leer('homologacion', emisor, { ...clave, numero: 8 })).toBeUndefined();
  });

  it('filtra por fecha y clase, y totaliza con las notas de crédito restando', async () => {
    await traer(
      arcaCon(
        [4],
        [
          enArca(TipoComprobante.FACTURA_A, 4, 1, 5, 10_000),
          enArca(TipoComprobante.FACTURA_B, 4, 1, 10, 20_000),
          enArca(TipoComprobante.NOTA_DE_CREDITO_B, 4, 1, 11, 5_000),
        ],
      ).fuente,
    );

    const filtro = { ambiente: 'homologacion' as const, emisor };
    expect((await repositorio.listar({ ...filtro, desde: fecha(10) })).length).toBe(2);
    expect((await repositorio.listar({ ...filtro, clase: 'A' })).length).toBe(1);
    expect(await repositorio.totales({ ...filtro, clase: 'B' })).toMatchObject({
      cantidad: 2,
      totalEnCentavos: 15_000,
    });
  });
});
