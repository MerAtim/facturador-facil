import { exito, fallo, type Cuit, type Resultado } from '@facturador/dominio';

import { URLS, type Ambiente } from '../ambiente';
import type { ErrorSoap } from '../soap/soap';
import type { Transporte } from '../soap/transporte';
import type { ProveedorDeTickets } from '../wsaa/proveedorDeTickets';
import type { ErrorWsaa } from '../wsaa/wsaa';
import { conTicket, type ErrorWsfe } from './comun';
import {
  consultarEstadoDeServidores,
  consultarPuntosDeVenta,
  type EstadoDeServidores,
  type PuntoDeVentaArca,
} from './wsfe';

/** Errores de WSFEv1 que indican que el certificado no puede operar con la CUIT. */
const SIN_ACCESO: readonly number[] = [600, 601];

/** Lo que se comprueba, en orden. Una etapa solo se intenta si pasaron las anteriores. */
export type EtapaDeVerificacion = 'conexion' | 'acceso' | 'punto_de_venta';

export type MotivoPuntoDeVentaNoHabilitado = 'bloqueado' | 'dado_de_baja' | 'solo_caea';

export type FallaDeVerificacion =
  | {
      readonly etapa: 'conexion';
      readonly tipo: 'servicio_caido';
      readonly servidores: EstadoDeServidores;
    }
  | {
      readonly etapa: EtapaDeVerificacion;
      readonly tipo: 'error';
      readonly error: ErrorSoap | ErrorWsaa | ErrorWsfe;
    }
  | {
      readonly etapa: 'punto_de_venta';
      readonly tipo: 'punto_de_venta_inexistente';
      /** Los que sí se pueden usar, para sugerir el número correcto. */
      readonly habilitados: readonly number[];
    }
  | {
      readonly etapa: 'punto_de_venta';
      readonly tipo: 'punto_de_venta_no_habilitado';
      readonly motivo: MotivoPuntoDeVentaNoHabilitado;
    };

export interface AltaVerificada {
  /** Homologación suele no informar puntos de venta: ahí puede faltar. */
  readonly puntoDeVenta?: PuntoDeVentaArca;
}

export interface VerificacionDelAlta {
  readonly ambiente: Ambiente;
  readonly cuit: Cuit;
  readonly puntoDeVenta: number;
  readonly tickets: ProveedorDeTickets;
  readonly transporte: Transporte;
}

/**
 * Comprueba de punta a punta que se puede facturar sin emitir nada: que ARCA responde (FEDummy),
 * que el certificado da acceso a la factura electrónica y que el punto de venta está habilitado
 * para web service. Consulta siempre a ARCA, sin usar lo guardado, porque se usa justo después de
 * hacer cambios en su sitio.
 */
export async function verificarAlta({
  ambiente,
  cuit,
  puntoDeVenta,
  tickets,
  transporte,
}: VerificacionDelAlta): Promise<Resultado<AltaVerificada, FallaDeVerificacion>> {
  const url = URLS[ambiente].wsfe;

  const servidores = await consultarEstadoDeServidores(transporte, url);
  if (!servidores.ok) return fallo({ etapa: 'conexion', tipo: 'error', error: servidores.error });
  if (Object.values(servidores.valor).some((estado) => estado !== 'OK')) {
    return fallo({ etapa: 'conexion', tipo: 'servicio_caido', servidores: servidores.valor });
  }

  const ticket = await tickets.obtener();
  if (!ticket.ok) return fallo({ etapa: 'acceso', tipo: 'error', error: ticket.error });

  const puntos = await conTicket(tickets, cuit, (autorizacion) =>
    consultarPuntosDeVenta(autorizacion, transporte, url),
  );
  if (!puntos.ok) {
    const { error } = puntos;
    const sinAcceso =
      error.tipo === 'rechazo_wsaa' ||
      (error.tipo === 'rechazo_wsfe' &&
        error.errores.some(({ codigo }) => SIN_ACCESO.includes(codigo)));
    return fallo({ etapa: sinAcceso ? 'acceso' : 'punto_de_venta', tipo: 'error', error });
  }

  const encontrado = puntos.valor.find(({ numero }) => numero === puntoDeVenta);
  if (!encontrado) {
    if (ambiente === 'homologacion') return exito({});
    return fallo({
      etapa: 'punto_de_venta',
      tipo: 'punto_de_venta_inexistente',
      habilitados: puntos.valor.filter((punto) => !motivoNoHabilitado(punto)).map((p) => p.numero),
    });
  }

  const motivo = motivoNoHabilitado(encontrado);
  return motivo
    ? fallo({ etapa: 'punto_de_venta', tipo: 'punto_de_venta_no_habilitado', motivo })
    : exito({ puntoDeVenta: encontrado });
}

/** Un punto de venta CAEA no sirve para pedir CAE, que es lo que hace la app. */
function motivoNoHabilitado(punto: PuntoDeVentaArca): MotivoPuntoDeVentaNoHabilitado | undefined {
  if (punto.fechaDeBaja) return 'dado_de_baja';
  if (punto.bloqueado) return 'bloqueado';
  if (/^CAEA\b/i.test(punto.tipoDeEmision)) return 'solo_caea';
  return undefined;
}
