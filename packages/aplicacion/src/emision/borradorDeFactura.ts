import {
  calcularTotales,
  Cantidad,
  Dinero,
  importeDe,
  UnidadDeMedida,
  type AlicuotaIva,
  type CantidadInvalida,
  type ItemComprobante,
  type ModoDePrecio,
  type TipoComprobante,
  type Totales,
} from '@facturador/dominio';

/** Un ítem tal como se está escribiendo: el texto de cada campo, todavía sin validar. */
export interface BorradorDeItem {
  readonly descripcion: string;
  readonly cantidad: string;
  readonly unidad: UnidadDeMedida;
  readonly precio: string;
  readonly alicuota: AlicuotaIva;
}

/** Con unidades, que es lo más común: elegir otra es opcional. */
export function itemVacio(alicuota: AlicuotaIva): BorradorDeItem {
  return { descripcion: '', cantidad: '', unidad: UnidadDeMedida.UNIDADES, precio: '', alicuota };
}

/**
 * La cantidad escrita. Vacía vale uno, que es lo más común; una cantidad imposible, como cero,
 * se informa para mostrarla junto al campo.
 */
export function cantidadDelBorrador(texto: string): Cantidad | CantidadInvalida {
  const escrito = sinComaFinal(texto);
  if (escrito === '') return Cantidad.UNO;
  const resultado = Cantidad.desdeTexto(escrito);
  return resultado.ok ? resultado.valor : resultado.error;
}

/**
 * El ítem para calcular mientras se escribe: lo que todavía no se puede interpretar cuenta como
 * cero, así los totales nunca saltan a un valor raro. Validarlo para emitir es otra cosa.
 */
export function itemDelBorrador(borrador: BorradorDeItem): ItemComprobante {
  const cantidad = cantidadDelBorrador(borrador.cantidad);
  const precio = Dinero.desdeTexto(sinComaFinal(borrador.precio));
  return {
    descripcion: borrador.descripcion.trim(),
    cantidad: cantidad instanceof Cantidad ? cantidad : Cantidad.UNO,
    unidad: borrador.unidad,
    precioUnitario: precio.ok ? precio.valor : Dinero.CERO,
    alicuota: borrador.alicuota,
  };
}

export function subtotalDelBorrador(borrador: BorradorDeItem): Dinero {
  const item = itemDelBorrador(borrador);
  // Una cantidad inválida no suma: mostrar un subtotal por uno confundiría.
  return cantidadDelBorrador(borrador.cantidad) instanceof Cantidad ? importeDe(item) : Dinero.CERO;
}

export function totalesDelBorrador(
  tipo: TipoComprobante,
  modoDePrecio: ModoDePrecio,
  items: readonly BorradorDeItem[],
): Totales {
  const validos = items.filter((item) => cantidadDelBorrador(item.cantidad) instanceof Cantidad);
  return calcularTotales({ tipo, modoDePrecio, items: validos.map(itemDelBorrador) });
}

/** `1.234,` se está escribiendo: vale lo mismo que `1.234`. */
function sinComaFinal(texto: string): string {
  return texto.endsWith(',') ? texto.slice(0, -1) : texto;
}
