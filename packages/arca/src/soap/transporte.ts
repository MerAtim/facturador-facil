export interface SolicitudHttp {
  readonly encabezados: Readonly<Record<string, string>>;
  readonly cuerpo: string;
}

export interface RespuestaHttp {
  readonly estado: number;
  readonly cuerpo: string;
}

/** POST HTTP. Separado de fetch para poder reemplazarlo por respuestas grabadas en los tests. */
export type Transporte = (url: string, solicitud: SolicitudHttp) => Promise<RespuestaHttp>;

/**
 * Usa el fetch de la plataforma, que valida los certificados TLS contra el almacén del sistema.
 * Esa validación nunca se desactiva.
 */
export const transporteFetch: Transporte = async (url, { encabezados, cuerpo }) => {
  const respuesta = await fetch(url, { method: 'POST', headers: encabezados, body: cuerpo });
  return { estado: respuesta.status, cuerpo: await respuesta.text() };
};
