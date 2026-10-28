/** Formato de los comprobantes impresos: punto de venta de 5 dígitos y número de 8. */
export const numeroDeComprobante = (puntoDeVenta: number, numero: number): string =>
  `${String(puntoDeVenta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`;
