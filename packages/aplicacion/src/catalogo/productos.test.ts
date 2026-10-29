import { AlicuotaIva, Dinero, UnidadDeMedida } from '@facturador/dominio';
import { beforeEach, describe, expect, it } from 'vitest';

import { crearBaseSqliteDePrueba } from '../persistencia/baseSqliteDePrueba';
import { migrar } from '../persistencia/migraciones';
import {
  crearProducto,
  crearRepositorioDeProductos,
  itemDelProducto,
  precioEnLaFactura,
  type Producto,
  type RepositorioDeProductos,
} from './productos';

const pesos = (texto: string) => {
  const resultado = Dinero.desdeTexto(texto);
  if (!resultado.ok) throw new Error('Importe de prueba inválido');
  return resultado.valor;
};

const pintura: Producto = {
  descripcion: 'Pintura látex 20 l',
  precio: pesos('12.100'),
  modoDePrecio: 'final',
  alicuota: AlicuotaIva.VEINTIUNO,
  unidad: UnidadDeMedida.UNIDADES,
};
const flete: Producto = {
  descripcion: 'Flete',
  precio: pesos('1.000'),
  modoDePrecio: 'neto',
  alicuota: AlicuotaIva.VEINTIUNO,
  unidad: UnidadDeMedida.SERVICIOS,
};
const clase: Producto = {
  descripcion: 'Clase de yoga',
  precio: pesos('5.000'),
  modoDePrecio: 'final',
  unidad: UnidadDeMedida.HORAS,
};

describe('crearProducto', () => {
  const datos = {
    descripcion: '  Thinner ',
    precio: '1.500,5',
    modoDePrecio: 'final' as const,
    unidad: UnidadDeMedida.LITROS,
  };

  it('valida lo cargado y limpia la descripción', () => {
    expect(crearProducto(datos)).toEqual({
      ok: true,
      valor: {
        descripcion: 'Thinner',
        precio: pesos('1.500,50'),
        modoDePrecio: 'final',
        unidad: UnidadDeMedida.LITROS,
      },
    });
  });

  it('informa todos los problemas juntos', () => {
    expect(
      crearProducto({ ...datos, descripcion: ' ', precio: '0', modoDePrecio: 'neto' }),
    ).toEqual({
      ok: false,
      error: [
        { tipo: 'descripcion_vacia' },
        { tipo: 'precio_invalido' },
        { tipo: 'falta_alicuota' },
      ],
    });
    expect(crearProducto({ ...datos, descripcion: 'x'.repeat(201), precio: 'diez' })).toEqual({
      ok: false,
      error: [{ tipo: 'descripcion_larga' }, { tipo: 'precio_invalido' }],
    });
  });
});

describe('precioEnLaFactura', () => {
  it('en el mismo modo, es el guardado', () => {
    expect(precioEnLaFactura(pintura, 'final', true).formatear()).toBe('$\u00a012.100,00');
    expect(precioEnLaFactura(flete, 'neto', true).formatear()).toBe('$\u00a01.000,00');
  });

  it('pasa de final a neto y de neto a final con su alícuota', () => {
    expect(precioEnLaFactura(pintura, 'neto', true).formatear()).toBe('$\u00a010.000,00');
    expect(precioEnLaFactura(flete, 'final', true).formatear()).toBe('$\u00a01.210,00');
  });

  it('sin IVA en la factura vale el precio final', () => {
    expect(precioEnLaFactura(flete, 'neto', false).formatear()).toBe('$\u00a01.210,00');
    expect(precioEnLaFactura(clase, 'neto', false).formatear()).toBe('$\u00a05.000,00');
  });

  it('sin alícuota no hay nada que convertir', () => {
    expect(precioEnLaFactura(clase, 'neto', true).formatear()).toBe('$\u00a05.000,00');
  });
});

describe('itemDelProducto', () => {
  it('arma el ítem como si se hubiera escrito', () => {
    expect(
      itemDelProducto(pintura, {
        modo: 'neto',
        informaIva: true,
        alicuotaPorDefecto: AlicuotaIva.DIEZ_Y_MEDIO,
      }),
    ).toEqual({
      descripcion: 'Pintura látex 20 l',
      cantidad: '',
      unidad: UnidadDeMedida.UNIDADES,
      precio: '10.000,00',
      alicuota: AlicuotaIva.VEINTIUNO,
    });
  });

  it('sin alícuota en el producto usa la de la factura', () => {
    const item = itemDelProducto(clase, {
      modo: 'final',
      informaIva: true,
      alicuotaPorDefecto: AlicuotaIva.DIEZ_Y_MEDIO,
    });

    expect(item.alicuota).toBe(AlicuotaIva.DIEZ_Y_MEDIO);
  });
});

describe('RepositorioDeProductos', () => {
  let base: ReturnType<typeof crearBaseSqliteDePrueba>;
  let productos: RepositorioDeProductos;
  let reloj: number;

  beforeEach(async () => {
    base = crearBaseSqliteDePrueba();
    await migrar(base);
    reloj = 1_000;
    productos = crearRepositorioDeProductos(base, () => reloj++);
  });

  const descripciones = (lista: readonly Producto[]) => lista.map((p) => p.descripcion);

  it('da de alta, lee y edita', async () => {
    const id = await productos.guardar(pintura);
    await productos.guardar({ ...pintura, id, precio: pesos('13.000') });

    expect(await productos.leer(id)).toEqual({ ...pintura, id, precio: pesos('13.000') });
    expect(await productos.leer(id + 1)).toBeUndefined();
  });

  it('conserva un producto sin alícuota', async () => {
    const id = await productos.guardar(clase);

    expect(await productos.leer(id)).toEqual({ ...clase, id });
  });

  it('borra', async () => {
    const id = await productos.guardar(pintura);

    await productos.borrar(id);

    expect(await productos.todos()).toEqual([]);
  });

  it('busca sin importar mayúsculas ni tildes, y los comodines como texto', async () => {
    await productos.guardar(pintura);
    await productos.guardar(flete);
    await productos.guardar({ ...clase, descripcion: 'Descuento 10%' });

    expect(descripciones(await productos.buscar('LATEX', 10))).toEqual(['Pintura látex 20 l']);
    expect(descripciones(await productos.buscar('10%', 10))).toEqual(['Descuento 10%']);
    expect(await productos.buscar('p_n', 10)).toEqual([]);
  });

  it('los más usados primero; entre los que se usaron igual, el más reciente', async () => {
    const idPintura = await productos.guardar(pintura);
    const idFlete = await productos.guardar(flete);
    await productos.guardar(clase);
    await productos.registrarUso(idPintura);
    await productos.registrarUso(idFlete);
    await productos.registrarUso(idFlete);

    expect(descripciones(await productos.buscar('', 10))).toEqual([
      'Flete',
      'Pintura látex 20 l',
      'Clase de yoga',
    ]);
    expect(await productos.buscar('', 2)).toHaveLength(2);
  });

  it('una fila dañada no tapa a las demás', async () => {
    await productos.guardar(pintura);
    await base.ejecutar(
      `INSERT INTO productos (descripcion, busqueda, precio_en_centavos, modo_de_precio, unidad,
        creado_en) VALUES ('Raro', 'raro', 100, 'final', 'leguas', 0)`,
    );

    expect(descripciones(await productos.todos())).toEqual(['Pintura látex 20 l']);
  });
});
