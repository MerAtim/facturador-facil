/**
 * Toda ruta que llega por deep link se redirige al inicio. Un link externo nunca debe
 * abrir una pantalla que ejecute acciones. Si en el futuro se habilita alguna ruta,
 * se agrega a una lista explícita y se validan sus parámetros.
 */
export function redirectSystemPath(): string {
  return '/';
}
