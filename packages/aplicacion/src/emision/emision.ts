import type { Comprobante, Receptor, Resultado } from '@facturador/dominio';

import type { ReceptoresFrecuentes } from '../receptores/receptoresFrecuentes';

/**
 * Quien pide la autorización a ARCA. Numera el comprobante y obtiene el CAE. El resultado y los
 * errores los define el adaptador: la pantalla los muestra tal como llegan.
 */
export interface AutorizadorDeComprobantes<Autorizado, Error> {
  autorizar(comprobante: Comprobante, puntoDeVenta: number): Promise<Resultado<Autorizado, Error>>;
}

export interface Emision<Autorizado, Error> {
  emitir(comprobante: Comprobante, receptor: Receptor): Promise<Resultado<Autorizado, Error>>;
}

export interface DependenciasDeEmision<Autorizado, Error> {
  readonly autorizador: AutorizadorDeComprobantes<Autorizado, Error>;
  readonly receptoresFrecuentes: ReceptoresFrecuentes;
  readonly puntoDeVenta: number;
}

/** Emite un comprobante y, si ARCA lo autoriza, recuerda al receptor entre los frecuentes. */
export function crearEmision<Autorizado, Error>({
  autorizador,
  receptoresFrecuentes,
  puntoDeVenta,
}: DependenciasDeEmision<Autorizado, Error>): Emision<Autorizado, Error> {
  return {
    async emitir(comprobante, receptor) {
      const resultado = await autorizador.autorizar(comprobante, puntoDeVenta);

      const { identificacion, condicion, nombre } = receptor;
      if (resultado.ok && identificacion.tipo === 'cuit') {
        // Recordarlo es un extra: si falla, la factura igual quedó emitida.
        await receptoresFrecuentes
          .registrarUso({ cuit: identificacion.cuit, condicion, ...(nombre ? { nombre } : {}) })
          .catch(() => undefined);
      }
      return resultado;
    },
  };
}
