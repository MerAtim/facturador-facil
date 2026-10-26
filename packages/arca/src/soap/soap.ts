import { exito, fallo, type Resultado } from '@facturador/dominio';

import type { Transporte } from './transporte';

export interface FallaSoap {
  readonly tipo: 'falla_soap';
  readonly codigo: string;
  readonly mensaje: string;
}

export interface RespuestaInesperada {
  readonly tipo: 'respuesta_inesperada';
  readonly estado: number;
}

export type ErrorSoap = FallaSoap | RespuestaInesperada;

/** Envía un cuerpo SOAP 1.1 y devuelve el XML de la respuesta, o la falla que informó el servicio. */
export async function llamarSoap(
  transporte: Transporte,
  url: string,
  accion: string,
  cuerpo: string,
): Promise<Resultado<string, ErrorSoap>> {
  const respuesta = await transporte(url, {
    encabezados: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${accion}"` },
    cuerpo:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      `<soap:Body>${cuerpo}</soap:Body></soap:Envelope>`,
  });

  const codigo = extraer(respuesta.cuerpo, 'faultcode');
  if (codigo !== undefined) {
    return fallo({
      tipo: 'falla_soap',
      codigo: codigo.replace(/^\w+:/, ''),
      mensaje: extraer(respuesta.cuerpo, 'faultstring') ?? '',
    });
  }
  if (respuesta.estado !== 200)
    return fallo({ tipo: 'respuesta_inesperada', estado: respuesta.estado });

  return exito(respuesta.cuerpo);
}

/**
 * Contenido de la primera aparición de una etiqueta, con o sin prefijo de espacio de nombres.
 * Alcanza para las respuestas planas del spike; los clientes definitivos usan un parser XML.
 */
export function extraer(xml: string, etiqueta: string): string | undefined {
  // La etiqueta siempre es una constante del código, nunca un dato recibido.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const patron = new RegExp(`<(?:\\w+:)?${etiqueta}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${etiqueta}>`);
  const contenido = patron.exec(xml)?.[1];
  return contenido === undefined ? undefined : desescapar(contenido);
}

const ENTIDADES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
};

function desescapar(texto: string): string {
  return texto.replace(/&(?:lt|gt|quot|apos|amp);/g, (entidad) => ENTIDADES[entidad] ?? entidad);
}
