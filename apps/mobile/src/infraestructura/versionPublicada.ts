/** Lo publica el proyecto en el repositorio: cambiarlo pasa por la misma revisión que el código. */
const URL_DE_LA_VERSION_MINIMA =
  'https://raw.githubusercontent.com/MerAtim/facturador-facil/main/publicacion/version-minima.json';

/** Corto: la consulta corre antes de emitir y no puede demorar la factura si la red anda mal. */
const TIEMPO_MAXIMO_MS = 8_000;

/**
 * El texto con la versión mínima. Sin conexión, con un error del servidor o si se agota el tiempo,
 * rechaza la promesa. Valida TLS como cualquier otro pedido de la app.
 */
export async function versionPublicada(): Promise<string> {
  const control = new AbortController();
  const temporizador = setTimeout(() => {
    control.abort();
  }, TIEMPO_MAXIMO_MS);
  try {
    const respuesta = await fetch(URL_DE_LA_VERSION_MINIMA, {
      cache: 'no-store',
      signal: control.signal,
    });
    if (!respuesta.ok) throw new Error(`La versión mínima respondió ${String(respuesta.status)}`);
    return await respuesta.text();
  } finally {
    clearTimeout(temporizador);
  }
}
