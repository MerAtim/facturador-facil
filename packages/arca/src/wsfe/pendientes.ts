import type { AlmacenSeguro } from '@facturador/aplicacion';
import { CODIGO_ARCA_DE_DOCUMENTO, type Comprobante } from '@facturador/dominio';

import { numeroDeDocumento, type ComprobanteEnArca } from './cae';

/**
 * Lo que identifica a un comprobante ante ARCA más allá de su número. Alcanza para reconocerlo
 * en la respuesta de FECompConsultar, que no devuelve los ítems.
 */
export interface Huella {
  /** `AAAAMMDD` */
  readonly fechaDeEmision: string;
  readonly totalEnCentavos: number;
  readonly codigoDeDocumento: number;
  readonly numeroDeDocumento: string;
}

/** Un comprobante que se envió a ARCA sin que se sepa todavía si lo autorizó. */
export interface Pendiente {
  readonly numero: number;
  readonly huella: Huella;
}

export function huellaDe({ datos, totales }: Comprobante): Huella {
  return {
    fechaDeEmision: datos.fechaDeEmision.aTextoArca(),
    totalEnCentavos: totales.total.centavos,
    codigoDeDocumento: CODIGO_ARCA_DE_DOCUMENTO[datos.identificacionReceptor.tipo],
    numeroDeDocumento: numeroDeDocumento(datos.identificacionReceptor),
  };
}

export const mismaHuella = (a: Huella, b: Huella) =>
  a.fechaDeEmision === b.fechaDeEmision &&
  a.totalEnCentavos === b.totalEnCentavos &&
  a.codigoDeDocumento === b.codigoDeDocumento &&
  a.numeroDeDocumento === b.numeroDeDocumento;

export const huellaEnArca = (comprobante: ComprobanteEnArca): Huella => ({
  fechaDeEmision: comprobante.fechaDeEmision.aTextoArca(),
  totalEnCentavos: comprobante.totalEnCentavos,
  codigoDeDocumento: comprobante.codigoDeDocumento,
  numeroDeDocumento: comprobante.numeroDeDocumento,
});

/**
 * Persiste los pendientes en el almacén seguro, porque la huella incluye el documento del
 * receptor. Un error del almacén se propaga: sin pendiente guardado no es seguro enviar.
 */
export function crearPendientes(almacen: AlmacenSeguro, prefijo: string) {
  const clave = (puntoDeVenta: number, codigoDeTipo: number) =>
    `${prefijo}.${String(puntoDeVenta)}.${String(codigoDeTipo)}`;

  return {
    async leer(puntoDeVenta: number, codigoDeTipo: number): Promise<Pendiente | undefined> {
      const texto = await almacen.leer(clave(puntoDeVenta, codigoDeTipo));
      return texto === undefined ? undefined : interpretar(texto);
    },
    guardar(puntoDeVenta: number, codigoDeTipo: number, pendiente: Pendiente): Promise<void> {
      return almacen.guardar(clave(puntoDeVenta, codigoDeTipo), JSON.stringify(pendiente));
    },
    borrar(puntoDeVenta: number, codigoDeTipo: number): Promise<void> {
      return almacen.borrar(clave(puntoDeVenta, codigoDeTipo));
    },
  };
}

/** Lo escribió este mismo módulo: un valor ilegible solo puede ser un almacén dañado. */
function interpretar(texto: string): Pendiente | undefined {
  try {
    const { numero, huella } = JSON.parse(texto) as Partial<Pendiente>;
    const valida =
      Number.isSafeInteger(numero) &&
      typeof huella?.fechaDeEmision === 'string' &&
      Number.isSafeInteger(huella.totalEnCentavos) &&
      Number.isSafeInteger(huella.codigoDeDocumento) &&
      typeof huella.numeroDeDocumento === 'string';
    return valida && numero !== undefined ? { numero, huella } : undefined;
  } catch {
    return undefined;
  }
}
