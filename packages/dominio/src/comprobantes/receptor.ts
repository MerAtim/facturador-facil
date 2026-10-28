import {
  SIN_IDENTIFICAR,
  type IdentificacionReceptor,
} from '../contribuyente/identificacionReceptor';
import { CondicionIvaReceptor } from './condicionIvaReceptor';

/** A quién se le factura: cómo se identifica ante ARCA y su condición frente al IVA. */
export interface Receptor {
  readonly identificacion: IdentificacionReceptor;
  readonly condicion: CondicionIvaReceptor;
  /** Cómo lo reconoce el emisor. Es opcional hasta completarlo desde el padrón de ARCA. */
  readonly nombre?: string;
  /** Se imprime en el comprobante; la factura A lo exige. */
  readonly domicilio?: string;
}

/** El receptor más común: un consumidor final que no se identifica. */
export const CONSUMIDOR_FINAL_SIN_IDENTIFICAR: Receptor = {
  identificacion: SIN_IDENTIFICAR,
  condicion: CondicionIvaReceptor.CONSUMIDOR_FINAL,
};
