import { exito, fallo, type Resultado } from '@facturador/dominio';

import { firmarCms } from '../criptografia/cms';
import { aBase64 } from '../criptografia/codificacion';
import type { Firmador } from '../criptografia/firmador';
import { llamarSoap, type ErrorSoap, type FallaSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import { buscar, leerXml } from '../soap/xml';

/** Margen hacia atrás para tolerar relojes del teléfono algo adelantados respecto de ARCA. */
const MARGEN_MS = 10 * 60 * 1000;

/** Argentina no tiene horario de verano, así que el desplazamiento es fijo. */
const DESPLAZAMIENTO_ARGENTINA_MS = -3 * 60 * 60 * 1000;

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

export type MotivoRechazoWsaa =
  | 'ticket_vigente'
  | 'no_autorizado'
  | 'certificado_vencido'
  | 'certificado_no_confiable'
  | 'certificado_invalido'
  | 'firma_invalida'
  | 'reloj_desfasado'
  | 'no_disponible'
  | 'desconocido';

export interface RechazoWsaa {
  readonly tipo: 'rechazo_wsaa';
  readonly motivo: MotivoRechazoWsaa;
  /** Código original de WSAA, para soporte. */
  readonly codigo: string;
  readonly mensaje: string;
}

export interface TicketIlegible {
  readonly tipo: 'ticket_ilegible';
}

export type ErrorWsaa = RechazoWsaa | TicketIlegible | Exclude<ErrorSoap, FallaSoap>;

/** Códigos de falla según la especificación técnica de WSAA. */
const MOTIVOS: Readonly<Record<string, MotivoRechazoWsaa>> = {
  'coe.alreadyAuthenticated': 'ticket_vigente',
  'coe.notAuthorized': 'no_autorizado',
  'cms.cert.expired': 'certificado_vencido',
  'cms.cert.untrusted': 'certificado_no_confiable',
  'cms.cert.invalid': 'certificado_invalido',
  'cms.cert.notFound': 'certificado_invalido',
  'cms.bad': 'firma_invalida',
  'cms.bad.base64': 'firma_invalida',
  'cms.sign.invalid': 'firma_invalida',
  'xml.generationTime.invalid': 'reloj_desfasado',
  'xml.expirationTime.expired': 'reloj_desfasado',
  'xml.expirationTime.invalid': 'reloj_desfasado',
  'wsaa.unavailable': 'no_disponible',
  'wsaa.internalError': 'no_disponible',
  'wsn.unavailable': 'no_disponible',
};

/** Ticket Request Access: el XML que se firma para pedir acceso a un servicio. */
export function crearTra(servicio: string, ahora: Date): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${String(Math.floor(ahora.getTime() / 1000))}</uniqueId>` +
    `<generationTime>${horaArgentina(ahora.getTime() - MARGEN_MS)}</generationTime>` +
    `<expirationTime>${horaArgentina(ahora.getTime() + MARGEN_MS)}</expirationTime>` +
    `</header><service>${servicio}</service></loginTicketRequest>`
  );
}

function horaArgentina(instante: number): string {
  return new Date(instante + DESPLAZAMIENTO_ARGENTINA_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, '-03:00');
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
  if (!respuesta.ok) {
    const error = respuesta.error;
    if (error.tipo !== 'falla_soap') return fallo(error);
    return fallo({
      tipo: 'rechazo_wsaa',
      motivo: MOTIVOS[error.codigo] ?? 'desconocido',
      codigo: error.codigo,
      mensaje: error.mensaje,
    });
  }

  // El ticket viaja como XML escapado dentro de loginCmsReturn.
  const ticket = leerXml(buscar(respuesta.valor, 'loginCmsReturn')?.texto ?? '');
  if (!ticket.ok) return fallo({ tipo: 'ticket_ilegible' });

  const token = buscar(ticket.valor, 'credentials', 'token')?.texto;
  const firma = buscar(ticket.valor, 'credentials', 'sign')?.texto;
  const vencimiento = new Date(buscar(ticket.valor, 'header', 'expirationTime')?.texto ?? '');
  if (!token || !firma || Number.isNaN(vencimiento.getTime())) {
    return fallo({ tipo: 'ticket_ilegible' });
  }

  return exito({ token, firma, vencimiento });
}
