/** Hasta 999.999.999.999,99: cabe holgado en centavos enteros sin perder precisión. */
const MAXIMO_DE_ENTEROS = 12;
const MAXIMO_DE_DECIMALES = 2;

/**
 * Da formato argentino a lo que el usuario escribe en un campo de importe, a medida que lo escribe:
 * agrupa los miles con punto y usa coma decimal. `1234,5` se muestra `1.234,5`.
 *
 * Como los puntos de miles los pone el campo, un punto recién escrito es la coma decimal: así
 * funciona aunque el teclado del dispositivo solo ofrezca punto. Lo que no es un dígito se descarta,
 * igual que los decimales de más.
 */
export function formatearEntradaDeImporte(texto: string): string {
  const conComa = !texto.includes(',') && texto.endsWith('.') ? `${texto.slice(0, -1)},` : texto;
  const [enteros = '', ...resto] = conComa.replace(/[^\d,]/g, '').split(',');

  const tieneComa = resto.length > 0;
  const decimales = resto.join('').slice(0, MAXIMO_DE_DECIMALES);
  const sinCeros = enteros.replace(/^0+/, '').slice(0, MAXIMO_DE_ENTEROS);

  if (!tieneComa) return agruparMiles(sinCeros === '' && enteros !== '' ? '0' : sinCeros);
  return `${agruparMiles(sinCeros === '' ? '0' : sinCeros)},${decimales}`;
}

/** El texto del campo listo para interpretarlo como importe: sin la coma final de `1.234,`. */
export function importeEscrito(texto: string): string {
  return texto.endsWith(',') ? texto.slice(0, -1) : texto;
}

function agruparMiles(digitos: string): string {
  const grupos: string[] = [];
  for (let fin = digitos.length; fin > 0; fin -= 3) {
    grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin));
  }
  return grupos.join('.');
}
