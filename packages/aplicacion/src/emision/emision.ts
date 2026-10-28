import type { Comprobante, Emisor, Receptor, Resultado } from '@facturador/dominio';

import type { RepositorioDeComprobantes } from '../comprobantes/comprobantesEmitidos';
import type { Ambiente } from '../configuracion/configuracion';
import type { ReceptoresFrecuentes } from '../receptores/receptoresFrecuentes';
import type { Registro } from '../registro/registro';

/** Lo que tiene que devolver un autorizador para poder guardar el comprobante. */
export interface ComprobanteNumerado {
  /** Con el CAE registrado. */
  readonly comprobante: Comprobante;
  readonly puntoDeVenta: number;
  readonly numero: number;
}

/**
 * Quien pide la autorización a ARCA. Numera el comprobante y obtiene el CAE. El resultado y los
 * errores los define el adaptador: la pantalla los muestra tal como llegan.
 */
export interface AutorizadorDeComprobantes<Autorizado extends ComprobanteNumerado, Error> {
  autorizar(comprobante: Comprobante, puntoDeVenta: number): Promise<Resultado<Autorizado, Error>>;
}

export interface Emision<Autorizado extends ComprobanteNumerado, Error> {
  emitir(comprobante: Comprobante, receptor: Receptor): Promise<Resultado<Autorizado, Error>>;
}

export interface DependenciasDeEmision<Autorizado extends ComprobanteNumerado, Error> {
  readonly autorizador: AutorizadorDeComprobantes<Autorizado, Error>;
  readonly comprobantes: RepositorioDeComprobantes;
  readonly receptoresFrecuentes: ReceptoresFrecuentes;
  readonly registro: Registro;
  readonly ambiente: Ambiente;
  /** Sus datos se guardan con cada comprobante, tal como estaban al emitirlo. */
  readonly emisor: Emisor;
  readonly puntoDeVenta: number;
}

/**
 * Emite un comprobante. Si ARCA lo autoriza, lo guarda y recuerda al receptor entre los frecuentes.
 */
export function crearEmision<Autorizado extends ComprobanteNumerado, Error>({
  autorizador,
  comprobantes,
  receptoresFrecuentes,
  registro,
  ambiente,
  emisor,
  puntoDeVenta,
}: DependenciasDeEmision<Autorizado, Error>): Emision<Autorizado, Error> {
  return {
    async emitir(comprobante, receptor) {
      const resultado = await autorizador.autorizar(comprobante, puntoDeVenta);

      if (resultado.ok) {
        const { valor } = resultado;
        // La factura ya es válida en ARCA: si no se puede guardar acá, igual se informa emitida.
        await comprobantes
          .guardar({
            ambiente,
            emisor,
            puntoDeVenta: valor.puntoDeVenta,
            numero: valor.numero,
            comprobante: valor.comprobante,
            receptor,
          })
          .catch((error: unknown) => {
            registro.error('no se pudo guardar el comprobante emitido', error);
          });
      }

      const { identificacion, condicion, nombre, domicilio } = receptor;
      if (resultado.ok && identificacion.tipo === 'cuit') {
        // Recordarlo es un extra: si falla, la factura igual quedó emitida.
        await receptoresFrecuentes
          .registrarUso({
            cuit: identificacion.cuit,
            condicion,
            ...(nombre ? { nombre } : {}),
            ...(domicilio ? { domicilio } : {}),
          })
          .catch(() => undefined);
      }
      return resultado;
    },
  };
}
