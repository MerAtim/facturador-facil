/** Cuánto puede quedar la app en segundo plano antes de pedir de nuevo el desbloqueo. */
export type EsperaDeBloqueo = 'al_instante' | 'un_minuto' | 'cinco_minutos';

export const ESPERAS_DE_BLOQUEO: readonly EsperaDeBloqueo[] = [
  'al_instante',
  'un_minuto',
  'cinco_minutos',
];

export const ESPERA_POR_DEFECTO: EsperaDeBloqueo = 'un_minuto';

const MILISEGUNDOS: Readonly<Record<EsperaDeBloqueo, number>> = {
  al_instante: 0,
  un_minuto: 60_000,
  cinco_minutos: 300_000,
};

/**
 * Si al volver a la app hay que pedir el desbloqueo. Sin registro de cuándo salió, como al abrirla,
 * siempre se bloquea. Un reloj que retrocede también bloquea: no se puede confiar en la espera.
 */
export function debeBloquear(
  salioA: number | undefined,
  ahora: number,
  espera: EsperaDeBloqueo,
): boolean {
  if (salioA === undefined || ahora < salioA) return true;
  return ahora - salioA >= MILISEGUNDOS[espera];
}

export const esEsperaDeBloqueo = (valor: unknown): valor is EsperaDeBloqueo =>
  ESPERAS_DE_BLOQUEO.some((espera) => espera === valor);
