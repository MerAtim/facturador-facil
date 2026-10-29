import { FechaCalendario } from '@facturador/dominio';

/** Desde cuántos días antes se avisa, y desde cuándo el aviso es urgente. */
export const DIAS_PARA_AVISAR = 30;
export const DIAS_PARA_URGIR = 7;

export type AvisoDeVencimiento =
  | { readonly tipo: 'vigente' }
  | {
      readonly tipo: 'por_vencer';
      /** Días de calendario en Argentina: 0 es hoy. */
      readonly dias: number;
      readonly urgente: boolean;
    }
  | { readonly tipo: 'vencido' };

/**
 * Sin certificado vigente no se puede facturar, y renovarlo lleva un trámite en ARCA: se avisa con
 * tiempo para hacerlo sin apuro.
 */
export function avisoDeVencimiento(vigenteHasta: Date, ahora: Date): AvisoDeVencimiento {
  if (ahora >= vigenteHasta) return { tipo: 'vencido' };
  const dias = FechaCalendario.enArgentina(ahora).diasHasta(
    FechaCalendario.enArgentina(vigenteHasta),
  );
  if (dias > DIAS_PARA_AVISAR) return { tipo: 'vigente' };
  return { tipo: 'por_vencer', dias, urgente: dias <= DIAS_PARA_URGIR };
}
