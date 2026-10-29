import type { ProblemaDeLaFactura } from '@facturador/aplicacion';
import type { ProblemaDeEnvio, TipoComprobante, Totales } from '@facturador/dominio';
import type { LineaDeTotal } from '@facturador/ui';

/** Neto e IVA; con más de una alícuota, separados por alícuota. La clase C no los muestra. */
export function lineasDelResumen(tipo: TipoComprobante, totales: Totales): readonly LineaDeTotal[] {
  if (!tipo.informaIva()) return [];

  const [unica, ...otras] = totales.porAlicuota;
  if (!unica || otras.length === 0) {
    return [
      { etiqueta: 'Neto', importe: totales.neto.formatear() },
      {
        etiqueta: unica ? `IVA\u00a0${unica.alicuota.formatear()}` : 'IVA',
        importe: totales.iva.formatear(),
      },
    ];
  }

  return totales.porAlicuota.flatMap(({ alicuota, neto, iva }) => [
    { etiqueta: `Neto al ${alicuota.formatear()}`, importe: neto.formatear() },
    { etiqueta: `IVA\u00a0${alicuota.formatear()}`, importe: iva.formatear() },
  ]);
}

/** Qué corregir, dicho para el usuario y señalando dónde. */
export function explicarProblema(problema: ProblemaDeLaFactura): string {
  switch (problema.tipo) {
    case 'item_sin_descripcion':
      return `Ítem ${String(problema.item)}: falta la descripción.`;
    case 'item_sin_precio':
      return `Ítem ${String(problema.item)}: falta el precio.`;
    case 'item_con_cantidad_invalida':
      return `Ítem ${String(problema.item)}: revisá la cantidad.`;
    case 'receptor_sin_domicilio':
      return 'La factura A lleva el domicilio del receptor. Cargalo con "Otro CUIT".';
    case 'envio':
      return explicarProblemaDeEnvio(problema.problema);
    case 'comprobante':
      return 'Revisá los datos de la factura.';
  }
}

function explicarProblemaDeEnvio(problema: ProblemaDeEnvio): string {
  switch (problema) {
    case 'falta_cuit_del_receptor':
      return 'Para esta factura el receptor tiene que tener CUIT. Elegilo con "Otro CUIT".';
    case 'falta_identificar_consumidor_final':
      return 'Desde $ 10.000.000 hay que identificar al consumidor final. Cargá su CUIT con "Otro CUIT".';
    case 'fecha_de_emision_fuera_de_rango':
      return 'La fecha de emisión está fuera del rango que acepta ARCA.';
  }
}
