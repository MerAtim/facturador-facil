export interface SolicitudHttp {
  readonly encabezados: Readonly<Record<string, string>>;
  readonly cuerpo: string;
}

export interface RespuestaHttp {
  readonly estado: number;
  readonly cuerpo: string;
}

/**
 * POST HTTP. Separado de fetch para poder reemplazarlo por respuestas grabadas en los tests.
 * Si no hay conexión o se agota el tiempo, rechaza la promesa.
 */
export type Transporte = (url: string, solicitud: SolicitudHttp) => Promise<RespuestaHttp>;

const TIEMPO_MAXIMO_MS = 30_000;

/**
 * Usa el fetch de la plataforma, que valida los certificados TLS contra el almacén del sistema.
 * Esa validación nunca se desactiva.
 */
export const transporteFetch: Transporte = async (url, { encabezados, cuerpo }) => {
  const control = new AbortController();
  const temporizador = setTimeout(() => {
    control.abort();
  }, TIEMPO_MAXIMO_MS);
  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: encabezados,
      body: cuerpo,
      signal: control.signal,
    });
    return { estado: respuesta.status, cuerpo: await respuesta.text() };
  } finally {
    clearTimeout(temporizador);
  }
};
