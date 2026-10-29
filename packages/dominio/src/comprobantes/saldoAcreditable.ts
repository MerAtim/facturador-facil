import { Dinero } from '../importes/dinero';
import type { AlicuotaIva } from '../iva/alicuotaIva';
import type { Comprobante, Totales } from './comprobante';

export interface SaldoPorAlicuota {
  readonly alicuota: AlicuotaIva;
  /** Neto más IVA. */
  readonly importe: Dinero;
}

/**
 * Lo que una factura todavía puede acreditar: su total menos el de las notas de crédito que ya la
 * ajustaron. En las clases que informan IVA se lleva también por alícuota, porque una nota no
 * puede devolver IVA de una alícuota que la factura no cobró.
 */
export interface SaldoAcreditable {
  readonly total: Dinero;
  /** Vacío en la clase C, que no informa IVA. */
  readonly porAlicuota: readonly SaldoPorAlicuota[];
}

/** Las notas que se pasan tienen que ser notas de crédito asociadas a esa factura. */
export function saldoAcreditable(
  factura: Comprobante,
  notas: readonly Comprobante[],
): SaldoAcreditable {
  const porAlicuota = importesPorAlicuota(factura.totales).map(({ alicuota, importe }) => ({
    alicuota,
    importe: notas.reduce(
      (saldo, nota) => descontar(saldo, importeDeLaAlicuota(nota.totales, alicuota)),
      importe,
    ),
  }));
  const total = notas.reduce(
    (saldo, nota) => descontar(saldo, nota.totales.total),
    factura.totales.total,
  );
  return { total, porAlicuota };
}

/** Si la nota acredita más de lo que queda, en total o en alguna alícuota. */
export function excedeElSaldo(nota: Comprobante, saldo: SaldoAcreditable): boolean {
  if (nota.totales.total.centavos > saldo.total.centavos) return true;
  return importesPorAlicuota(nota.totales).some(({ alicuota, importe }) => {
    const disponible = saldo.porAlicuota.find((grupo) => grupo.alicuota === alicuota);
    return importe.centavos > (disponible?.importe.centavos ?? 0);
  });
}

function importesPorAlicuota(totales: Totales): SaldoPorAlicuota[] {
  return totales.porAlicuota.map(({ alicuota, neto, iva }) => ({
    alicuota,
    importe: neto.sumar(iva),
  }));
}

function importeDeLaAlicuota(totales: Totales, alicuota: AlicuotaIva): Dinero {
  const grupo = totales.porAlicuota.find((g) => g.alicuota === alicuota);
  return grupo ? grupo.neto.sumar(grupo.iva) : Dinero.CERO;
}

/** Nunca baja de cero, aunque las notas sumen más que la factura. */
function descontar(saldo: Dinero, importe: Dinero): Dinero {
  const resto = saldo.restar(importe);
  return resto.ok ? resto.valor : Dinero.CERO;
}
