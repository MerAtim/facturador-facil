/** La operación no terminó a tiempo. */
export class TiempoAgotado extends Error {
  constructor(readonly operacion: string) {
    super(`${operacion}: no terminó a tiempo`);
    this.name = 'TiempoAgotado';
  }
}

/**
 * Espera la promesa, pero no más que `milisegundos`: después rechaza con `TiempoAgotado`. Sirve
 * para operaciones del sistema que, si fallan por dentro, pueden no terminar nunca, como armar un
 * PDF con un motor web que se cerró.
 */
export function conLimiteDeTiempo<T>(
  promesa: Promise<T>,
  milisegundos: number,
  operacion: string,
): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const temporizador = setTimeout(() => {
      rechazar(new TiempoAgotado(operacion));
    }, milisegundos);
    promesa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolver(valor);
      },
      (error: unknown) => {
        clearTimeout(temporizador);
        rechazar(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
