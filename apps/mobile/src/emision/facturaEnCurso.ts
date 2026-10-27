import type { CaeOtorgado, ErrorAutorizacion } from '@facturador/arca';
import type { Comprobante, Receptor, Resultado } from '@facturador/dominio';

export type ResultadoDeEmision = Resultado<CaeOtorgado, ErrorAutorizacion>;

export interface FacturaEnCurso {
  readonly comprobante: Comprobante;
  readonly receptor: Receptor;
  readonly resultado?: ResultadoDeEmision;
}

let actual: FacturaEnCurso | undefined;

/**
 * La factura que pasa de la carga a la revisión y de ahí al resultado. Vive solo en memoria: si la
 * app se cierra a mitad de camino, el autorizador ya recuerda lo que hay que recuperar.
 */
export const facturaEnCurso = {
  leer: (): FacturaEnCurso | undefined => actual,
  preparar(comprobante: Comprobante, receptor: Receptor): void {
    actual = { comprobante, receptor };
  },
  registrarResultado(resultado: ResultadoDeEmision): void {
    if (actual) actual = { ...actual, resultado };
  },
  terminar(): void {
    actual = undefined;
  },
};
