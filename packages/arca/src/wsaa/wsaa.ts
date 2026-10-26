import { exito, fallo, type Resultado } from '@facturador/dominio';

import { firmarCms } from '../criptografia/cms';
import { aBase64 } from '../criptografia/codificacion';
import type { Firmador } from '../criptografia/firmador';
import { extraer, llamarSoap, type ErrorSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';

/** Margen hacia atrás para tolerar relojes del teléfono algo adelantados respecto de ARCA. */
const MARGEN_MS = 10 * 60 * 1000;

export interface TicketDeAcceso {
  readonly token: string;
  readonly firma: string;
  readonly vencimiento: Date;
}

export interface SolicitudDeTicket {
  readonly servicio: string;
  /** Certificado X.509 que ARCA emitió para la clave del firmador, en DER. */
  readonly certificado: Uint8Array;
  readonly ahora: Date;
}

export type ErrorWsaa = ErrorSoap | { readonly tipo: 'ticket_incompleto' };

/** Ticket Request Access: el XML que se firma para pedir acceso a un servicio. */
export function crearTra(servicio: string, ahora: Date): string {
  const sinMilisegundos = (fecha: Date) => fecha.toISOString().replace(/\.\d{3}Z$/, 'Z');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${String(Math.floor(ahora.getTime() / 1000))}</uniqueId>` +
    `<generationTime>${sinMilisegundos(new Date(ahora.getTime() - MARGEN_MS))}</generationTime>` +
    `<expirationTime>${sinMilisegundos(new Date(ahora.getTime() + MARGEN_MS))}</expirationTime>` +
    `</header><service>${servicio}</service></loginTicketRequest>`
  );
}

export async function solicitarTicket(
  solicitud: SolicitudDeTicket,
  firmador: Firmador,
  transporte: Transporte,
  url: string,
): Promise<Resultado<TicketDeAcceso, ErrorWsaa>> {
  const tra = new TextEncoder().encode(crearTra(solicitud.servicio, solicitud.ahora));
  const cms = await firmarCms(tra, solicitud.certificado, firmador, solicitud.ahora);

  const respuesta = await llamarSoap(
    transporte,
    url,
    '',
    `<loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><in0>${aBase64(cms)}</in0></loginCms>`,
  );
  if (!respuesta.ok) return respuesta;

  // El ticket viaja como XML escapado dentro de loginCmsReturn.
  const ticket = extraer(respuesta.valor, 'loginCmsReturn') ?? '';
  const token = extraer(ticket, 'token');
  const firma = extraer(ticket, 'sign');
  const vencimiento = extraer(ticket, 'expirationTime');
  if (!token || !firma || !vencimiento) return fallo({ tipo: 'ticket_incompleto' });

  return exito({ token, firma, vencimiento: new Date(vencimiento) });
}
