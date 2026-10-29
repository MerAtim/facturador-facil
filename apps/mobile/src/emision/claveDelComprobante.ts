import { TipoComprobante } from '@facturador/dominio';

const ENTERO = /^\d{1,8}$/;

/** Los parámetros para abrir un comprobante en el detalle o en la carga de su nota de crédito. */
export const parametrosDe = (tipo: TipoComprobante, puntoDeVenta: number, numero: number) => ({
  tipo: String(tipo.codigoArca),
  puntoDeVenta: String(puntoDeVenta),
  numero: String(numero),
});

/** Los parámetros llegan como texto: se validan como cualquier entrada. */
export function claveDe(parametros: Record<string, string | string[] | undefined>) {
  const { tipo, puntoDeVenta, numero } = parametros;
  if (typeof tipo !== 'string' || typeof puntoDeVenta !== 'string' || typeof numero !== 'string') {
    return undefined;
  }
  if (!ENTERO.test(tipo) || !ENTERO.test(puntoDeVenta) || !ENTERO.test(numero)) return undefined;
  const tipoDeComprobante = TipoComprobante.desdeCodigoArca(Number(tipo));
  return (
    tipoDeComprobante && {
      tipo: tipoDeComprobante,
      puntoDeVenta: Number(puntoDeVenta),
      numero: Number(numero),
    }
  );
}
