import { exito, fallo, type Cuit, type Resultado } from '@facturador/dominio';

import { llamarSoap, type ErrorSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import { buscar, escaparXml, type ElementoXml } from '../soap/xml';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa, TicketDeAcceso } from '../wsaa/wsaa';

export const ESPACIO_DE_NOMBRES = 'http://ar.gov.afip.dif.FEV1/';

/** WSFEv1 rechaza así un token vencido o que no reconoce. */
const TOKEN_INVALIDO = 600;

export interface Autorizacion {
  readonly ticket: TicketDeAcceso;
  readonly cuit: Cuit;
}

/** Errores, observaciones y eventos de WSFEv1 comparten esta forma. */
export interface ErrorDeArca {
  readonly codigo: number;
  readonly mensaje: string;
}

/** WSFEv1 informa los errores de negocio dentro de una respuesta exitosa, no como falla SOAP. */
export interface RechazoWsfe {
  readonly tipo: 'rechazo_wsfe';
  readonly errores: readonly ErrorDeArca[];
}

export type ErrorWsfe = ErrorSoap | RechazoWsfe;

/** Llama a un método autenticado y devuelve su elemento `<metodo>Result`. */
export async function llamarWsfe(
  metodo: string,
  autorizacion: Autorizacion,
  contenido: string,
  transporte: Transporte,
  url: string,
): Promise<Resultado<ElementoXml, ErrorSoap>> {
  const respuesta = await llamarSoap(
    transporte,
    url,
    `${ESPACIO_DE_NOMBRES}${metodo}`,
    `<${metodo} xmlns="${ESPACIO_DE_NOMBRES}">${auth(autorizacion)}${contenido}</${metodo}>`,
  );
  if (!respuesta.ok) return respuesta;

  // Sin el elemento de resultado no hay forma de distinguir una respuesta vacía de una rota.
  const resultado = buscar(respuesta.valor, `${metodo}Result`);
  return resultado ? exito(resultado) : fallo({ tipo: 'respuesta_inesperada', estado: 200 });
}

/**
 * Obtiene el ticket y llama a WSFEv1. ARCA puede invalidar un ticket antes de su vencimiento:
 * si rechaza el token, pide otro y reintenta una sola vez. Es seguro porque ARCA no procesó nada.
 */
export async function conTicket<T, E extends { readonly tipo: string }>(
  tickets: ProveedorDeTickets,
  cuit: Cuit,
  llamar: (autorizacion: Autorizacion) => Promise<Resultado<T, E>>,
): Promise<Resultado<T, E | ErrorWsaa>> {
  const intentar = async (): Promise<Resultado<T, E | ErrorWsaa>> => {
    const ticket = await tickets.obtener();
    if (!ticket.ok) return ticket;
    return llamar({ ticket: ticket.valor, cuit });
  };

  const resultado = await intentar();
  if (resultado.ok || !rechazaElTicket(resultado.error)) return resultado;

  await tickets.invalidar();
  return intentar();
}

const esRechazoWsfe = (error: { readonly tipo: string }): error is RechazoWsfe =>
  error.tipo === 'rechazo_wsfe';

const rechazaElTicket = (error: { readonly tipo: string }) =>
  esRechazoWsfe(error) && error.errores.some(({ codigo }) => codigo === TOKEN_INVALIDO);

/** Arma un elemento con su valor escapado. Todo valor pasa por acá, aunque sea un número. */
export const campo = (nombre: string, valor: string | number) =>
  `<${nombre}>${escaparXml(String(valor))}</${nombre}>`;

function auth({ ticket, cuit }: Autorizacion): string {
  return `<Auth>${campo('Token', ticket.token)}${campo('Sign', ticket.firma)}${campo('Cuit', cuit.valor)}</Auth>`;
}

/** Lee la lista de `Errors`, `Observaciones` o `Events`. Sin contenedor, no hay mensajes. */
export function leerMensajes(contenedor: ElementoXml | undefined): ErrorDeArca[] {
  return (contenedor?.hijos ?? []).map((mensaje) => ({
    codigo: Number(texto(mensaje, 'Code')),
    mensaje: texto(mensaje, 'Msg'),
  }));
}

export const texto = (elemento: ElementoXml, nombre: string) =>
  buscar(elemento, nombre)?.texto.trim() ?? '';

/** Los enteros de WSFEv1 vienen como texto: cualquier otra cosa es una respuesta rota. */
export function entero(elemento: ElementoXml, nombre: string): number | undefined {
  const valor = texto(elemento, nombre);
  return /^\d{1,15}$/.test(valor) ? Number(valor) : undefined;
}
