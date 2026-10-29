import { LARGO_MAXIMO_DEL_NOMBRE } from '@facturador/aplicacion';
import {
  CondicionIvaReceptor,
  exito,
  fallo,
  LARGO_MAXIMO_DOMICILIO,
  type Cuit,
  type Resultado,
} from '@facturador/dominio';

import { URLS, type Ambiente } from '../ambiente';
import { llamarSoap, type ErrorSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import { buscar, escaparXml, type ElementoXml } from '../soap/xml';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';

/** El servicio de constancia de inscripción, que se autoriza en ARCA aparte de la factura. */
export const SERVICIO_DEL_PADRON = 'ws_sr_constancia_inscripcion';

const ESPACIO_DE_NOMBRES = 'http://a5.soap.ws.server.puc.sr/';

/** Impuestos del régimen general que definen la condición frente al IVA. */
const IVA = 30;
const IVA_EXENTO = 32;

/**
 * Lo que informa ARCA de un CUIT, ya validado. Cada dato puede faltar: el padrón no siempre
 * tiene domicilio fiscal y la condición frente al IVA solo se deduce en los casos claros.
 */
export interface ContribuyenteDelPadron {
  readonly nombre?: string;
  readonly domicilio?: string;
  readonly condicion?: CondicionIvaReceptor;
  /** Con la clave inactiva, ARCA rechaza las facturas A a ese CUIT. */
  readonly activo: boolean;
}

export interface CuitInexistente {
  readonly tipo: 'cuit_inexistente';
}

/** El CUIT existe pero ARCA no entrega su constancia, por ejemplo por inconsistencias. */
export interface SinConstancia {
  readonly tipo: 'sin_constancia';
}

export type ErrorDelPadron = CuitInexistente | SinConstancia | ErrorSoap | ErrorWsaa;

export interface Padron {
  readonly ambiente: Ambiente;
  /** El CUIT del emisor, que es quien consulta. */
  readonly cuit: Cuit;
  /** Tickets pedidos para SERVICIO_DEL_PADRON. */
  readonly tickets: ProveedorDeTickets;
  readonly transporte: Transporte;
}

/** Consulta la constancia de inscripción de un CUIT. Lo que devuelve ARCA se trata como entrada no confiable. */
export async function consultarPadron(
  { ambiente, cuit, tickets, transporte }: Padron,
  consultado: Cuit,
): Promise<Resultado<ContribuyenteDelPadron, ErrorDelPadron>> {
  const ticket = await tickets.obtener();
  if (!ticket.ok) return ticket;

  // Los hijos van sin espacio de nombres: por eso el prefijo en el elemento del método.
  const respuesta = await llamarSoap(
    transporte,
    URLS[ambiente].padron,
    '',
    `<a5:getPersona_v2 xmlns:a5="${ESPACIO_DE_NOMBRES}">` +
      campo('token', ticket.valor.token) +
      campo('sign', ticket.valor.firma) +
      campo('cuitRepresentada', cuit.valor) +
      campo('idPersona', consultado.valor) +
      '</a5:getPersona_v2>',
  );
  if (!respuesta.ok) {
    const { error } = respuesta;
    return error.tipo === 'falla_soap' && /no existe persona/i.test(error.mensaje)
      ? fallo({ tipo: 'cuit_inexistente' })
      : respuesta;
  }

  const persona = buscar(respuesta.valor, 'personaReturn');
  if (!persona) return fallo({ tipo: 'respuesta_inesperada', estado: 200 });

  const generales = buscar(persona, 'datosGenerales');
  if (!generales) return fallo({ tipo: 'sin_constancia' });
  // Datos de otra persona no se usan nunca, aunque el resto parezca bien.
  if (texto(generales, 'idPersona') !== consultado.valor) {
    return fallo({ tipo: 'respuesta_inesperada', estado: 200 });
  }

  const nombre = limpiar(nombreDe(generales), LARGO_MAXIMO_DEL_NOMBRE);
  const domicilio = limpiar(domicilioDe(generales), LARGO_MAXIMO_DOMICILIO);
  const condicion = condicionDe(persona);
  return exito({
    ...(nombre && { nombre }),
    ...(domicilio && { domicilio }),
    ...(condicion && { condicion }),
    activo: texto(generales, 'estadoClave').toUpperCase() === 'ACTIVO',
  });
}

const campo = (nombre: string, valor: string) => `<${nombre}>${escaparXml(valor)}</${nombre}>`;

const texto = (elemento: ElementoXml, nombre: string) =>
  buscar(elemento, nombre)?.texto.trim() ?? '';

/** Una persona jurídica tiene razón social; una humana, apellido y nombre, como en la constancia. */
function nombreDe(generales: ElementoXml): string {
  const razonSocial = texto(generales, 'razonSocial');
  if (razonSocial) return razonSocial;
  return [texto(generales, 'apellido'), texto(generales, 'nombre')].filter(Boolean).join(' ');
}

function domicilioDe(generales: ElementoXml): string {
  const fiscal = buscar(generales, 'domicilioFiscal');
  if (!fiscal) return '';
  const partes = ['direccion', 'localidad', 'descripcionProvincia']
    .map((nombre) => texto(fiscal, nombre))
    .filter(Boolean);
  // En la Ciudad de Buenos Aires la localidad suele repetir la provincia.
  return partes.filter((parte, i) => partes.indexOf(parte) === i).join(', ');
}

/**
 * Solo los casos que no dejan dudas. Cualquier otra situación queda para que la elija el usuario:
 * una condición equivocada hace rechazar la factura o emitir la clase incorrecta.
 */
function condicionDe(persona: ElementoXml): CondicionIvaReceptor | undefined {
  if (buscar(persona, 'datosMonotributo')) return CondicionIvaReceptor.MONOTRIBUTO;
  const impuestos = new Set(
    (buscar(persona, 'datosRegimenGeneral')?.hijos ?? [])
      .filter((hijo) => hijo.nombre === 'impuesto')
      .map((impuesto) => Number(texto(impuesto, 'idImpuesto'))),
  );
  if (impuestos.has(IVA)) return CondicionIvaReceptor.RESPONSABLE_INSCRIPTO;
  if (impuestos.has(IVA_EXENTO)) return CondicionIvaReceptor.EXENTO;
  return undefined;
}

// Caracteres de control y de dirección del texto: no aportan nada a un nombre y pueden disfrazarlo.
const INVISIBLES = /[\p{Cc}\p{Cf}]/gu;

/** Texto de afuera listo para un campo: sin invisibles, con espacios simples y dentro del largo. */
function limpiar(valor: string, maximo: number): string | undefined {
  const limpio = valor.replace(INVISIBLES, ' ').replace(/\s+/g, ' ').trim().slice(0, maximo).trim();
  return limpio || undefined;
}
