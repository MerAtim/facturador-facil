const DIGITOS_DEL_CUIT = 11;

/**
 * Da formato a un CUIT mientras se escribe: `20123456786` se muestra `20-12345678-6`. Cada guion
 * aparece recién con el dígito que lo sigue, así borrar nunca se traba en un guion.
 */
export function formatearEntradaDeCuit(texto: string): string {
  const digitos = soloDigitosDelCuit(texto);
  const partes = [digitos.slice(0, 2), digitos.slice(2, 10), digitos.slice(10)];
  return partes.filter((parte) => parte !== '').join('-');
}

/** Los dígitos escritos, sin guiones ni espacios y sin pasar de once. */
export function soloDigitosDelCuit(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, DIGITOS_DEL_CUIT);
}

/** Si ya se escribieron los once dígitos y conviene validar. */
export function cuitCompleto(texto: string): boolean {
  return soloDigitosDelCuit(texto).length === DIGITOS_DEL_CUIT;
}
