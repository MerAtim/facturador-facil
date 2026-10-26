import { exito, fallo, type Resultado } from '@facturador/dominio';

import type { Transporte } from './transporte';
import { buscar, leerXml, type ElementoXml, type XmlInvalido } from './xml';

export interface FallaSoap {
  readonly tipo: 'falla_soap';
  readonly codigo: string;
  readonly mensaje: string;
}

export interface RespuestaInesperada {
  readonly tipo: 'respuesta_inesperada';
  readonly estado: number;
}

export interface SinConexion {
  readonly tipo: 'sin_conexion';
}

export type ErrorSoap = FallaSoap | RespuestaInesperada | SinConexion | XmlInvalido;

/** Envía un cuerpo SOAP 1.1 y devuelve el primer elemento del Body, o la falla que informó el servicio. */
export async function llamarSoap(
  transporte: Transporte,
  url: string,
  accion: string,
  cuerpo: string,
): Promise<Resultado<ElementoXml, ErrorSoap>> {
  let respuesta;
  try {
    respuesta = await transporte(url, {
      encabezados: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${accion}"` },
      cuerpo:
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
        `<soap:Body>${cuerpo}</soap:Body></soap:Envelope>`,
    });
  } catch {
    return fallo({ tipo: 'sin_conexion' });
  }

  const inesperada = fallo<RespuestaInesperada>({
    tipo: 'respuesta_inesperada',
    estado: respuesta.estado,
  });

  const sobre = leerXml(respuesta.cuerpo);
  // Un proxy o una página de error devuelven HTML: importa más el estado que el parseo.
  if (!sobre.ok) return respuesta.estado === 200 ? sobre : inesperada;

  const falla = buscar(sobre.valor, 'Body', 'Fault');
  if (falla) {
    return fallo({
      tipo: 'falla_soap',
      codigo: (buscar(falla, 'faultcode')?.texto ?? '').replace(/^[^:]*:/, ''),
      mensaje: buscar(falla, 'faultstring')?.texto ?? '',
    });
  }

  const contenido = buscar(sobre.valor, 'Body')?.hijos[0];
  if (respuesta.estado !== 200 || !contenido) return inesperada;

  return exito(contenido);
}
