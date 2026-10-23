import type { Cuit } from './cuit';
import type { Dni } from './dni';

export type IdentificacionReceptor =
  | { readonly tipo: 'cuit'; readonly cuit: Cuit }
  | { readonly tipo: 'dni'; readonly dni: Dni }
  | { readonly tipo: 'sin_identificar' };

/** Códigos de FEParamGetTiposDoc. */
export const CODIGO_ARCA_DE_DOCUMENTO: Readonly<Record<IdentificacionReceptor['tipo'], number>> = {
  cuit: 80,
  dni: 96,
  sin_identificar: 99,
};

export const SIN_IDENTIFICAR: IdentificacionReceptor = { tipo: 'sin_identificar' };
