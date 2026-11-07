import { Dinero } from '@facturador/dominio';

import type { ComprobanteEmitido } from './comprobantesEmitidos';

/**
 * Lo facturado en un período, ya descontadas las notas de crédito. Los importes van en centavos con
 * signo: si en el período se acreditó más de lo que se facturó, dan negativo.
 */
export interface TotalesDelPeriodo {
  readonly cantidad: number;
  readonly totalEnCentavos: number;
  readonly netoEnCentavos: number;
  readonly ivaEnCentavos: number;
}

/** Con los importes guardados de cada comprobante: no hace falta consultar a ARCA. */
export function totalesDelPeriodo(comprobantes: readonly ComprobanteEmitido[]): TotalesDelPeriodo {
  let totalEnCentavos = 0;
  let netoEnCentavos = 0;
  let ivaEnCentavos = 0;
  for (const { comprobante } of comprobantes) {
    // La nota de crédito anula o achica una factura; la de débito la agranda.
    const signo = comprobante.datos.tipo.naturaleza === 'nota_de_credito' ? -1 : 1;
    const { total, neto, iva } = comprobante.totales;
    totalEnCentavos += signo * total.centavos;
    netoEnCentavos += signo * neto.centavos;
    ivaEnCentavos += signo * iva.centavos;
  }
  return { cantidad: comprobantes.length, totalEnCentavos, netoEnCentavos, ivaEnCentavos };
}

/** `$ 1.234,56`, o `−$ 1.234,56` si es negativo. */
export function formatearConSigno(centavos: number): string {
  const importe = Dinero.desdeCentavos(Math.abs(centavos));
  const texto = importe.ok ? importe.valor.formatear() : '';
  return centavos < 0 ? `−${texto}` : texto;
}
