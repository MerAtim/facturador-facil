import {
  formatearConSigno,
  type ComprobanteEmitido,
  type EmitidoEnOtroDispositivo,
} from '@facturador/aplicacion';
import { numeroCompleto } from '@facturador/arca';
import { Cuit, type Receptor, type TipoComprobante } from '@facturador/dominio';

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
    titulo: tipo.descripcion,
    numero: numeroCompleto(puntoDeVenta, numero),
    total: comprobante.totales.total.formatear(),
    receptor: nombreDelReceptor(receptor),
    fecha: fechaDeEmision.formatear(),
  };
}

/** ARCA guarda solo el documento del receptor: `0` es un consumidor final sin identificar. */
export function receptorSegunArca(documento: string): string {
  if (documento === '' || /^0+$/.test(documento)) return 'Consumidor Final';
  const cuit = documento.length === 11 ? Cuit.crear(documento) : undefined;
  return cuit?.ok ? `CUIT ${cuit.valor.formateado()}` : `DNI ${documento}`;
}

/** Los textos de la tarjeta de un comprobante emitido desde otro dispositivo. */
export function resumenDeOtroDispositivo({
  tipo,
  puntoDeVenta,
  numero,
  totalEnCentavos,
  documentoDelReceptor,
  fechaDeEmision,
}: EmitidoEnOtroDispositivo) {
  return {
    titulo: tipo.descripcion,
    numero: numeroCompleto(puntoDeVenta, numero),
    total: formatearConSigno(totalEnCentavos),
    receptor: `${receptorSegunArca(documentoDelReceptor)} · Otro celular`,
    fecha: fechaDeEmision.formatear(),
  };
}

/** El tipo dentro de una oración: `factura B`, `nota de crédito A`. */
export const enUnaFrase = (tipo: TipoComprobante): string =>
  `${tipo.nombre.toLowerCase()} ${tipo.clase}`;
