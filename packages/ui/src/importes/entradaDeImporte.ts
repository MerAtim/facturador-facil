/** Hasta 999.999.999.999,99: cabe holgado en centavos enteros sin perder precisión. */
const MAXIMO_DE_ENTEROS = 12;

/**
 * Da formato argentino a lo que el usuario escribe en un campo de importe, a medida que lo escribe:
 * agrupa los miles con punto y usa coma decimal. `1234,5` se muestra `1.234,5`.
 *
 * Como los puntos de miles los pone el campo, un punto recién escrito es la coma decimal: así
 * funciona aunque el teclado del dispositivo solo ofrezca punto. Lo que no es un dígito se descarta,
 * igual que los decimales de más.
 */
export function formatearEntradaDeImporte(texto: string): string {
  return formatearDecimal(texto, { enteros: MAXIMO_DE_ENTEROS, decimales: 2, agruparMiles: true });
}

/** Lo mismo para una cantidad: hasta tres decimales y sin separador de miles. `2,5` horas. */
export function formatearEntradaDeCantidad(texto: string): string {
  return formatearDecimal(texto, { enteros: 9, decimales: 3, agruparMiles: false });
}

function formatearDecimal(
  texto: string,
  limites: { readonly enteros: number; readonly decimales: number; readonly agruparMiles: boolean },
): string {
  const conComa = !texto.includes(',') && texto.endsWith('.') ? `${texto.slice(0, -1)},` : texto;
  const [enteros = '', ...resto] = conComa.replace(/[^\d,]/g, '').split(',');

  const tieneComa = resto.length > 0;
  const decimales = resto.join('').slice(0, limites.decimales);
  const sinCeros = enteros.replace(/^0+/, '').slice(0, limites.enteros);
  const parteEntera = sinCeros === '' && (tieneComa || enteros !== '') ? '0' : sinCeros;
  const agrupada = limites.agruparMiles ? agruparMiles(parteEntera) : parteEntera;

  return tieneComa ? `${agrupada},${decimales}` : agrupada;
}

function agruparMiles(digitos: string): string {
  const grupos: string[] = [];
  for (let fin = digitos.length; fin > 0; fin -= 3) {
    grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin));
  }
  return grupos.join('.');
}
