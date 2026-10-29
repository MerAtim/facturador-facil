import { Dinero } from '@facturador/dominio';

/**
 * Lo que se escribió en el buscador, interpretado de todas las formas posibles a la vez: el mismo
 * texto puede ser parte de un nombre, un CUIT o DNI, un número de comprobante o un importe. Basta
 * que coincida una.
 */
export interface BusquedaInterpretada {
  /** Para `LIKE`, con los comodines del texto escapados. */
  readonly nombre: string;
  /** Solo los dígitos, para `LIKE` sobre el CUIT o DNI. */
  readonly documento?: string;
  readonly numero?: number;
  /** Escrito como `3-12` o `00003-00000012`. */
  readonly puntoDeVentaYNumero?: { readonly puntoDeVenta: number; readonly numero: number };
  readonly totalEnCentavos?: number;
}

export const LARGO_MAXIMO_DE_LA_BUSQUEDA = 60;
const NUMERO_COMPLETO = /^(\d{1,5})-(\d{1,8})$/;
const SOLO_DIGITOS = /^\d+$/;
const NUMERO_MAXIMO = 99_999_999;
/** Lo mínimo para buscar dentro de un CUIT o DNI sin que casi cualquier dígito coincida. */
const DIGITOS_MINIMOS_DEL_DOCUMENTO = 3;

/** Sin nada para buscar, devuelve undefined: se listan todos. */
export function interpretarBusqueda(texto: string): BusquedaInterpretada | undefined {
  const limpio = texto.trim().slice(0, LARGO_MAXIMO_DE_LA_BUSQUEDA);
  if (limpio === '') return undefined;

  const digitos = limpio.replace(/[\s.-]/g, '');
  const completo = NUMERO_COMPLETO.exec(limpio);
  const importe = Dinero.desdeTexto(limpio);

  return {
    nombre: `%${escaparComodines(limpio)}%`,
    ...(SOLO_DIGITOS.test(digitos) &&
      digitos.length >= DIGITOS_MINIMOS_DEL_DOCUMENTO && { documento: `%${digitos}%` }),
    ...(SOLO_DIGITOS.test(limpio) && Number(limpio) <= NUMERO_MAXIMO && { numero: Number(limpio) }),
    ...(completo && {
      puntoDeVentaYNumero: { puntoDeVenta: Number(completo[1]), numero: Number(completo[2]) },
    }),
    ...(importe.ok && !importe.valor.esCero() && { totalEnCentavos: importe.valor.centavos }),
  };
}

/** `%`, `_` y la barra de escape pierden su significado en `LIKE ... ESCAPE '\'`. */
export function escaparComodines(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}
