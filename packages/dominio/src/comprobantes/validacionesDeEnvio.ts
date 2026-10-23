import type { FechaCalendario } from '../compartido/fechaCalendario';
import type { Dinero } from '../importes/dinero';
import type { Comprobante } from './comprobante';
import { incluyeServicios } from './concepto';
import { CondicionIvaReceptor } from './condicionIvaReceptor';

export interface ContextoDeEnvio {
  readonly hoy: FechaCalendario;
  /** Total a partir del cual hay que identificar al consumidor final. Lo fija ARCA y cambia por resolución. */
  readonly montoParaIdentificarConsumidorFinal: Dinero;
}

export type ProblemaDeEnvio =
  | 'fecha_de_emision_fuera_de_rango'
  | 'falta_cuit_del_receptor'
  | 'falta_identificar_consumidor_final';

const DIAS_PERMITIDOS_PRODUCTOS = 5;
const DIAS_PERMITIDOS_SERVICIOS = 10;

/** Receptores que pueden facturarse sin CUIT: con DNI o, debajo del monto de ARCA, sin identificar. */
const PUEDEN_NO_TENER_CUIT: readonly CondicionIvaReceptor[] = [
  CondicionIvaReceptor.CONSUMIDOR_FINAL,
  CondicionIvaReceptor.NO_CATEGORIZADO,
];

/**
 * Reglas que dependen del contexto (la fecha de hoy, montos que fija ARCA) y que conviene detectar
 * antes de enviar. Devuelve todos los problemas juntos para mostrarlos de una vez.
 */
export function validarParaEnvio(
  comprobante: Comprobante,
  contexto: ContextoDeEnvio,
): readonly ProblemaDeEnvio[] {
  const { datos, totales } = comprobante;
  const problemas: ProblemaDeEnvio[] = [];

  const diasPermitidos = incluyeServicios(datos.concepto)
    ? DIAS_PERMITIDOS_SERVICIOS
    : DIAS_PERMITIDOS_PRODUCTOS;
  if (Math.abs(contexto.hoy.diasHasta(datos.fechaDeEmision)) > diasPermitidos) {
    problemas.push('fecha_de_emision_fuera_de_rango');
  }

  const identificacion = datos.identificacionReceptor.tipo;
  const exigeCuit = datos.tipo.clase === 'A' || !PUEDEN_NO_TENER_CUIT.includes(datos.receptor);
  if (exigeCuit && identificacion !== 'cuit') {
    problemas.push('falta_cuit_del_receptor');
  } else if (
    identificacion === 'sin_identificar' &&
    totales.total.centavos >= contexto.montoParaIdentificarConsumidorFinal.centavos
  ) {
    problemas.push('falta_identificar_consumidor_final');
  }

  return problemas;
}
