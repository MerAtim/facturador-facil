import {
  crearEmision,
  crearPreferencias,
  crearRegistro,
  crearReceptoresFrecuentes,
  salidaDeConsola,
  type Configuracion,
  type Emision,
} from '@facturador/aplicacion';
import {
  aliasDeClave,
  crearAlmacenDeCertificados,
  crearAutorizadorWsfe,
  crearProveedorDeTickets,
  firmadorDeClave,
  transporteFetch,
  type CaeOtorgado,
  type ErrorAutorizacion,
} from '@facturador/arca';

import { almacenDeClavesDelDispositivo } from './arca/almacenDeClavesDelDispositivo';
import { almacenLocalDelDispositivo } from './infraestructura/almacenLocalDelDispositivo';
import { almacenSeguroDelDispositivo } from './infraestructura/almacenSeguroDelDispositivo';

/**
 * El único lugar donde los casos de uso se conectan con los adaptadores del dispositivo y de ARCA.
 * Las pantallas piden lo que necesitan acá y no arman infraestructura por su cuenta.
 */

/** En producción solo quedan errores, sin su detalle. */
export const registro = crearRegistro({ produccion: !__DEV__, salida: salidaDeConsola });
export const preferencias = crearPreferencias(almacenLocalDelDispositivo);
export const receptoresFrecuentes = crearReceptoresFrecuentes(almacenSeguroDelDispositivo);
export const almacenDeCertificados = crearAlmacenDeCertificados(almacenSeguroDelDispositivo);

export type EmisionWsfe = Emision<CaeOtorgado, ErrorAutorizacion>;

/**
 * Una emisión por emisor y ambiente. Se reutiliza para que el ticket de acceso quede en memoria y
 * el turno por punto de venta valga entre pantallas.
 */
const emisiones = new Map<string, EmisionWsfe>();

/** La emisión para la configuración vigente, o undefined si todavía no hay certificado. */
export async function emisionPara({
  emisor,
  ambiente,
}: Configuracion): Promise<EmisionWsfe | undefined> {
  const { cuit, puntoDeVenta } = emisor.datos;
  const titular = { ambiente, cuit };
  const clave = `${ambiente}.${cuit.valor}.${String(puntoDeVenta)}`;

  const existente = emisiones.get(clave);
  if (existente) return existente;

  const certificado = await almacenDeCertificados.leer(titular);
  if (!certificado) return undefined;

  const tickets = crearProveedorDeTickets({
    ambiente,
    cuit,
    servicio: 'wsfe',
    certificado: certificado.der,
    firmador: firmadorDeClave(almacenDeClavesDelDispositivo, aliasDeClave(titular)),
    transporte: transporteFetch,
    almacen: almacenSeguroDelDispositivo,
  });
  const emision = crearEmision({
    autorizador: crearAutorizadorWsfe({
      ambiente,
      cuit,
      tickets,
      transporte: transporteFetch,
      almacen: almacenSeguroDelDispositivo,
    }),
    receptoresFrecuentes,
    puntoDeVenta,
  });
  emisiones.set(clave, emision);
  return emision;
}

/** Al cambiar el certificado, las emisiones armadas con el anterior ya no sirven. */
export function olvidarEmisiones(): void {
  emisiones.clear();
}
