import {
  crearEmision,
  crearRepositorioDeComprobantes,
  crearPreferencias,
  crearRegistro,
  crearRegistroDeAlta,
  crearRepositorioDeClientes,
  crearRepositorioDeProductos,
  crearControlDeVersion,
  importarClientesFrecuentes,
  salidaDeConsola,
  type Configuracion,
  type Emision,
} from '@facturador/aplicacion';
import {
  aliasDeClave,
  consultarPadron,
  crearAlmacenDeCertificados,
  crearAutorizadorWsfe,
  crearProveedorDeTickets,
  firmadorDeClave,
  transporteFetch,
  verificarAlta,
  SERVICIO_DEL_PADRON,
  type AltaVerificada,
  type CaeOtorgado,
  type ContribuyenteDelPadron,
  type ErrorDelPadron,
  type ErrorAutorizacion,
  type FallaDeVerificacion,
  type ProveedorDeTickets,
} from '@facturador/arca';
import type { Cuit, Resultado } from '@facturador/dominio';
import Constants from 'expo-constants';

import { almacenDeClavesDelDispositivo } from './arca/almacenDeClavesDelDispositivo';
import { almacenLocalDelDispositivo } from './infraestructura/almacenLocalDelDispositivo';
import { almacenSeguroDelDispositivo } from './infraestructura/almacenSeguroDelDispositivo';
import { baseDeDatosDelDispositivo } from './infraestructura/baseDeDatosDelDispositivo';
import { versionPublicada } from './infraestructura/versionPublicada';

/**
 * El único lugar donde los casos de uso se conectan con los adaptadores del dispositivo y de ARCA.
 * Las pantallas piden lo que necesitan acá y no arman infraestructura por su cuenta.
 */

/** En producción solo quedan errores, sin su detalle. */
export const registro = crearRegistro({ produccion: !__DEV__, salida: salidaDeConsola });
export const preferencias = crearPreferencias(almacenLocalDelDispositivo);
export const clientes = crearRepositorioDeClientes(baseDeDatosDelDispositivo);
export const productos = crearRepositorioDeProductos(baseDeDatosDelDispositivo);
export const almacenDeCertificados = crearAlmacenDeCertificados(almacenSeguroDelDispositivo);
export const registroDeAlta = crearRegistroDeAlta(almacenLocalDelDispositivo);
export const comprobantesEmitidos = crearRepositorioDeComprobantes(baseDeDatosDelDispositivo);
export const controlDeVersion = crearControlDeVersion({
  instalada: Constants.expoConfig?.version ?? '',
  publicada: versionPublicada,
  almacen: almacenLocalDelDispositivo,
});

export type EmisionWsfe = Emision<CaeOtorgado, ErrorAutorizacion>;

/**
 * Un proveedor de tickets por emisor, ambiente y servicio, compartido entre la emisión y la
 * verificación del alta: así los pedidos simultáneos a WSAA se juntan en uno.
 */
const proveedoresDeTickets = new Map<string, ProveedorDeTickets>();

/** Una emisión por emisor, ambiente y punto de venta, para que el turno valga entre pantallas. */
const emisiones = new Map<string, EmisionWsfe>();

/** Los tickets para la configuración vigente, o undefined si todavía no hay certificado. */
async function ticketsPara(ambiente: Configuracion['ambiente'], cuit: Cuit, servicio = 'wsfe') {
  const clave = `${ambiente}.${cuit.valor}.${servicio}`;
  const existente = proveedoresDeTickets.get(clave);
  if (existente) return existente;

  const titular = { ambiente, cuit };
  const certificado = await almacenDeCertificados.leer(titular);
  if (!certificado) return undefined;

  const tickets = crearProveedorDeTickets({
    ambiente,
    cuit,
    servicio,
    certificado: certificado.der,
    firmador: firmadorDeClave(almacenDeClavesDelDispositivo, aliasDeClave(titular)),
    transporte: transporteFetch,
    almacen: almacenSeguroDelDispositivo,
  });
  proveedoresDeTickets.set(clave, tickets);
  return tickets;
}

/** La emisión para la configuración vigente, o undefined si todavía no hay certificado. */
export async function emisionPara({
  emisor,
  ambiente,
}: Configuracion): Promise<EmisionWsfe | undefined> {
  const { cuit, puntoDeVenta } = emisor.datos;
  const clave = `${ambiente}.${cuit.valor}.${String(puntoDeVenta)}`;

  const existente = emisiones.get(clave);
  if (existente) return existente;

  const tickets = await ticketsPara(ambiente, cuit);
  if (!tickets) return undefined;

  const emision = crearEmision({
    autorizador: crearAutorizadorWsfe({
      ambiente,
      cuit,
      tickets,
      transporte: transporteFetch,
      almacen: almacenSeguroDelDispositivo,
    }),
    comprobantes: comprobantesEmitidos,
    clientes,
    registro,
    ambiente,
    emisor,
    puntoDeVenta,
  });
  emisiones.set(clave, emision);
  return emision;
}

/** Comprueba contra ARCA que se puede facturar. Sin certificado, devuelve undefined. */
export async function verificarAltaDe({
  emisor,
  ambiente,
}: Configuracion): Promise<Resultado<AltaVerificada, FallaDeVerificacion> | undefined> {
  const { cuit, puntoDeVenta } = emisor.datos;
  const tickets = await ticketsPara(ambiente, cuit);
  if (!tickets) return undefined;
  return verificarAlta({ ambiente, cuit, puntoDeVenta, tickets, transporte: transporteFetch });
}

/** Los datos de un CUIT según el padrón de ARCA. Sin certificado, devuelve undefined. */
export async function consultarPadronDe(
  { emisor, ambiente }: Configuracion,
  consultado: Cuit,
): Promise<Resultado<ContribuyenteDelPadron, ErrorDelPadron> | undefined> {
  const { cuit } = emisor.datos;
  const tickets = await ticketsPara(ambiente, cuit, SERVICIO_DEL_PADRON);
  if (!tickets) return undefined;
  return consultarPadron({ ambiente, cuit, tickets, transporte: transporteFetch }, consultado);
}

/** Al cambiar el certificado, lo armado con el anterior ya no sirve. */
export function olvidarEmisiones(): void {
  emisiones.clear();
  proveedoresDeTickets.clear();
}

/** Los receptores frecuentes de antes de la tabla de clientes pasan a ella una sola vez. */
export function importarClientesDeAntes(): void {
  importarClientesFrecuentes(almacenSeguroDelDispositivo, clientes).catch((error: unknown) => {
    registro.error('no se pudieron importar los clientes frecuentes', error);
  });
}
