import {
  AlicuotaIva,
  calcularDesdePrecioFinal,
  calcularDesdePrecioNeto,
  Dinero,
  exito,
  fallo,
  UnidadDeMedida,
  type ModoDePrecio,
  type Resultado,
} from '@facturador/dominio';

import type { BorradorDeItem } from '../emision/borradorDeFactura';
import {
  escaparComodines,
  LARGO_MAXIMO_DE_LA_BUSQUEDA,
} from '../comprobantes/busquedaDeComprobantes';
import type { BaseDeDatos, FilaSql } from '../puertos/baseDeDatos';

/** Un producto o servicio que se factura seguido, para cargarlo con un toque. */
export interface Producto {
  /** Sin id, todavía no se guardó. */
  readonly id?: number;
  readonly descripcion: string;
  readonly precio: Dinero;
  /** Si el precio guardado incluye IVA o no. */
  readonly modoDePrecio: ModoDePrecio;
  /** Obligatoria con precio neto: sin ella el neto no dice cuánto se cobra. */
  readonly alicuota?: AlicuotaIva;
  readonly unidad: UnidadDeMedida;
}

export const LARGO_MAXIMO_DE_LA_DESCRIPCION = 200;

export interface DatosDelProducto {
  readonly descripcion: string;
  readonly precio: string;
  readonly modoDePrecio: ModoDePrecio;
  readonly alicuota?: AlicuotaIva;
  readonly unidad: UnidadDeMedida;
}

export type ProblemaDelProducto =
  | { readonly tipo: 'descripcion_vacia' }
  | { readonly tipo: 'descripcion_larga' }
  | { readonly tipo: 'precio_invalido' }
  | { readonly tipo: 'falta_alicuota' };

/** Lo cargado en pantalla, validado con los value objects del dominio. */
export function crearProducto(
  datos: DatosDelProducto,
): Resultado<Producto, readonly ProblemaDelProducto[]> {
  const descripcion = datos.descripcion.replace(/\p{Cc}/gu, ' ').trim();
  const precio = Dinero.desdeTexto(datos.precio);
  const problemas: ProblemaDelProducto[] = [
    ...(descripcion === '' ? [{ tipo: 'descripcion_vacia' as const }] : []),
    ...(descripcion.length > LARGO_MAXIMO_DE_LA_DESCRIPCION
      ? [{ tipo: 'descripcion_larga' as const }]
      : []),
    ...(!precio.ok || precio.valor.esCero() ? [{ tipo: 'precio_invalido' as const }] : []),
    ...(datos.modoDePrecio === 'neto' && !datos.alicuota
      ? [{ tipo: 'falta_alicuota' as const }]
      : []),
  ];
  if (!precio.ok || problemas.length > 0) return fallo(problemas);
  return exito({
    descripcion,
    precio: precio.valor,
    modoDePrecio: datos.modoDePrecio,
    ...(datos.alicuota && { alicuota: datos.alicuota }),
    unidad: datos.unidad,
  });
}

/**
 * El precio del producto en el modo de la factura. Si coinciden, es el guardado; si no, se pasa
 * de neto a final o al revés con el mismo cálculo que usa el comprobante, así que puede diferir
 * en un centavo del que se cargaría a mano. Sin IVA en la factura, vale el precio final.
 */
export function precioEnLaFactura(
  producto: Producto,
  modo: ModoDePrecio,
  informaIva: boolean,
): Dinero {
  const { precio, modoDePrecio, alicuota } = producto;
  const destino = informaIva ? modo : 'final';
  if (modoDePrecio === destino || !alicuota) return precio;
  if (destino === 'final') {
    const { neto, iva } = calcularDesdePrecioNeto(precio, alicuota);
    return neto.sumar(iva);
  }
  return calcularDesdePrecioFinal(precio, alicuota).neto;
}

/**
 * El ítem de la factura que sale del producto, como si se hubiera escrito: el precio en el modo de
 * la factura y, si el producto no tiene alícuota, la que se usaría por defecto.
 */
export function itemDelProducto(
  producto: Producto,
  {
    modo,
    informaIva,
    alicuotaPorDefecto,
  }: {
    readonly modo: ModoDePrecio;
    readonly informaIva: boolean;
    readonly alicuotaPorDefecto: AlicuotaIva;
  },
): BorradorDeItem {
  return {
    descripcion: producto.descripcion,
    cantidad: '',
    unidad: producto.unidad,
    // Sin el signo: es lo que se ve en el campo del precio.
    precio: precioEnLaFactura(producto, modo, informaIva).formatear().replace('$ ', ''),
    alicuota: producto.alicuota ?? alicuotaPorDefecto,
  };
}

/** El catálogo, en la base cifrada. Los más usados primero, para tenerlos a mano. */
export interface RepositorioDeProductos {
  /** Por parte de la descripción, sin importar mayúsculas ni tildes. Los más usados primero. */
  buscar(texto: string, limite: number): Promise<readonly Producto[]>;
  /** Todos, para el respaldo. */
  todos(): Promise<readonly Producto[]>;
  leer(id: number): Promise<Producto | undefined>;
  /** Alta si no tiene id; si no, edición. Devuelve el id. */
  guardar(producto: Producto): Promise<number>;
  /** Se usó en una factura: sube en la lista. */
  registrarUso(id: number): Promise<void>;
  borrar(id: number): Promise<void>;
}

const MODOS: readonly ModoDePrecio[] = ['final', 'neto'];

const AGREGAR = `
  INSERT INTO productos (
    descripcion, busqueda, precio_en_centavos, modo_de_precio, alicuota, unidad, usos, ultimo_uso,
    creado_en
  ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
  RETURNING id
`;

const EDITAR = `
  UPDATE productos SET
    descripcion = ?, busqueda = ?, precio_en_centavos = ?, modo_de_precio = ?, alicuota = ?,
    unidad = ?
  WHERE id = ?
`;

const BUSCAR = `
  SELECT id, descripcion, precio_en_centavos, modo_de_precio, alicuota, unidad FROM productos
  WHERE ? IS NULL OR busqueda LIKE ? ESCAPE '\\'
  ORDER BY usos DESC, ultimo_uso DESC, busqueda
  LIMIT ?
`;

const TODOS = `SELECT id, descripcion, precio_en_centavos, modo_de_precio, alicuota, unidad FROM productos ORDER BY id`;
const LEER = `SELECT id, descripcion, precio_en_centavos, modo_de_precio, alicuota, unidad FROM productos WHERE id = ?`;
const REGISTRAR_USO = `UPDATE productos SET usos = usos + 1, ultimo_uso = ? WHERE id = ?`;
const BORRAR = `DELETE FROM productos WHERE id = ?`;

export function crearRepositorioDeProductos(
  base: BaseDeDatos,
  ahora: () => number = Date.now,
): RepositorioDeProductos {
  const rearmar = (filas: readonly FilaSql[]) =>
    // Una fila que no se puede leer no tapa a las demás.
    filas.flatMap((fila) => {
      const producto = desdeFila(fila);
      return producto ? [producto] : [];
    });
  const datos = ({ descripcion, precio, modoDePrecio, alicuota, unidad }: Producto) => [
    descripcion,
    normalizar(descripcion),
    precio.centavos,
    modoDePrecio,
    alicuota?.codigoArca ?? null,
    unidad.clave,
  ];

  return {
    async buscar(texto, limite) {
      const limpio = normalizar(texto.trim().slice(0, LARGO_MAXIMO_DE_LA_BUSQUEDA));
      const patron = limpio === '' ? null : `%${escaparComodines(limpio)}%`;
      return rearmar(await base.consultar(BUSCAR, [patron, patron, limite]));
    },
    async todos() {
      return rearmar(await base.consultar(TODOS));
    },
    async leer(id) {
      return rearmar(await base.consultar(LEER, [id]))[0];
    },
    async guardar(producto) {
      if (producto.id !== undefined) {
        await base.ejecutar(EDITAR, [...datos(producto), producto.id]);
        return producto.id;
      }
      const [fila] = await base.consultar(AGREGAR, [...datos(producto), ahora()]);
      const id = fila?.['id'];
      if (typeof id !== 'number') throw new Error('La base no devolvió el id del producto');
      return id;
    },
    async registrarUso(id) {
      await base.ejecutar(REGISTRAR_USO, [ahora(), id]);
    },
    async borrar(id) {
      await base.ejecutar(BORRAR, [id]);
    },
  };
}

/** Lo guardado se valida como cualquier entrada. */
function desdeFila(fila: FilaSql): Producto | undefined {
  const { id, descripcion, precio_en_centavos, modo_de_precio, alicuota, unidad } = fila;
  const precio =
    typeof precio_en_centavos === 'number' ? Dinero.desdeCentavos(precio_en_centavos) : undefined;
  const modoDePrecio = MODOS.find((modo) => modo === modo_de_precio);
  const deIva = typeof alicuota === 'number' ? AlicuotaIva.desdeCodigoArca(alicuota) : undefined;
  const deMedida = typeof unidad === 'string' ? UnidadDeMedida.desdeClave(unidad) : undefined;
  if (
    typeof id !== 'number' ||
    typeof descripcion !== 'string' ||
    !precio?.ok ||
    !modoDePrecio ||
    (alicuota !== null && !deIva) ||
    !deMedida
  ) {
    return undefined;
  }
  return {
    id,
    descripcion,
    precio: precio.valor,
    modoDePrecio,
    ...(deIva && { alicuota: deIva }),
    unidad: deMedida,
  };
}

/** Para buscar sin importar mayúsculas ni tildes. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
