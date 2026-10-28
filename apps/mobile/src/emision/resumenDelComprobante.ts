import type { ComprobanteEmitido } from '@facturador/aplicacion';
import { numeroCompleto } from '@facturador/arca';
import type { Naturaleza, Receptor } from '@facturador/dominio';

const NOMBRE: Readonly<Record<Naturaleza, string>> = {
  factura: 'Factura',
  nota_de_debito: 'Nota de débito',
  nota_de_credito: 'Nota de crédito',
};

/** Cómo se identifica al receptor en una línea: su nombre, su documento o su condición. */
export function nombreDelReceptor({ nombre, identificacion, condicion }: Receptor): string {
  if (nombre) return nombre;
  switch (identificacion.tipo) {
    case 'cuit':
      return `CUIT ${identificacion.cuit.formateado()}`;
    case 'dni':
      return `DNI ${identificacion.dni.valor}`;
    case 'sin_identificar':
      return condicion.descripcion;
  }
}

/** Los textos de la tarjeta de un comprobante emitido. */
export function resumenDelComprobante({
  comprobante,
  receptor,
  puntoDeVenta,
  numero,
}: ComprobanteEmitido) {
  const { tipo, fechaDeEmision } = comprobante.datos;
  return {
    titulo: `${NOMBRE[tipo.naturaleza]} ${tipo.clase}`,
    numero: numeroCompleto(puntoDeVenta, numero),
    total: comprobante.totales.total.formatear(),
    receptor: nombreDelReceptor(receptor),
    fecha: fechaDeEmision.formatear(),
  };
}
