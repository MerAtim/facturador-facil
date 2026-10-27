import {
  CODIGO_ARCA_DE_DOCUMENTO,
  type Comprobante,
  type Cuit,
  type IdentificacionReceptor,
} from '@facturador/dominio';
import qrcode from 'qrcode-generator';

/** Dirección que ARCA definió para los QR de comprobantes electrónicos (RG 4291). */
const URL_DEL_QR = 'https://www.afip.gob.ar/fe/qr/';

export interface ComprobanteEmitido {
  readonly comprobante: Comprobante;
  readonly cuitEmisor: Cuit;
  readonly puntoDeVenta: number;
  readonly numero: number;
}

/**
 * Los datos del QR según la especificación de ARCA, versión 1. El documento del receptor es
 * opcional: un consumidor final sin identificar no lo lleva.
 */
export function datosDelQr({ comprobante, cuitEmisor, puntoDeVenta, numero }: ComprobanteEmitido) {
  const { autorizacion, datos, totales } = comprobante;
  if (!autorizacion) throw new Error('El QR solo se arma para un comprobante autorizado');

  const fecha = datos.fechaDeEmision.aTextoArca();
  return {
    ver: 1,
    fecha: `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`,
    cuit: Number(cuitEmisor.valor),
    ptoVta: puntoDeVenta,
    tipoCmp: datos.tipo.codigoArca,
    nroCmp: numero,
    importe: totales.total.centavos / 100,
    moneda: 'PES',
    ctz: 1,
    ...documentoDelReceptor(datos.identificacionReceptor),
    tipoCodAut: 'E',
    codAut: Number(autorizacion.cae),
  };
}

/** La URL que codifica el QR: los datos en JSON, en base64, como parámetro `p`. */
export function urlDelQr(emitido: ComprobanteEmitido): string {
  return `${URL_DEL_QR}?p=${btoa(JSON.stringify(datosDelQr(emitido)))}`;
}

/**
 * El QR como SVG, armado módulo por módulo. No usa el SVG que genera la librería: así lo que se
 * inserta en el documento son solo números calculados acá.
 */
export function svgDelQr(contenido: string, tamanio: number): string {
  const codigo = qrcode(0, 'M');
  codigo.addData(contenido);
  codigo.make();

  const modulos = codigo.getModuleCount();
  const borde = 4;
  const lado = modulos + borde * 2;
  const cuadrados: string[] = [];
  for (let fila = 0; fila < modulos; fila++) {
    for (let columna = 0; columna < modulos; columna++) {
      if (codigo.isDark(fila, columna)) {
        cuadrados.push(`M${String(columna + borde)} ${String(fila + borde)}h1v1h-1z`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(tamanio)}" height="${String(tamanio)}" ` +
    `viewBox="0 0 ${String(lado)} ${String(lado)}" shape-rendering="crispEdges">` +
    `<rect width="${String(lado)}" height="${String(lado)}" fill="#fff"/>` +
    `<path d="${cuadrados.join('')}" fill="#000"/></svg>`
  );
}

function documentoDelReceptor(identificacion: IdentificacionReceptor) {
  switch (identificacion.tipo) {
    case 'cuit':
      return {
        tipoDocRec: CODIGO_ARCA_DE_DOCUMENTO.cuit,
        nroDocRec: Number(identificacion.cuit.valor),
      };
    case 'dni':
      return {
        tipoDocRec: CODIGO_ARCA_DE_DOCUMENTO.dni,
        nroDocRec: Number(identificacion.dni.valor),
      };
    case 'sin_identificar':
      return {};
  }
}
