import { exito, fallo, type Resultado } from '../compartido/resultado';

export type MotivoCantidadInvalida = 'formato_invalido' | 'demasiados_decimales' | 'no_positiva';

export interface CantidadInvalida {
  readonly tipo: 'cantidad_invalida';
  readonly motivo: MotivoCantidadInvalida;
}

const SOLO_DIGITOS = /^\d+$/;
const LONGITUD_MAXIMA = 15;
const ESCALA = 1000;

/** Cantidad positiva con hasta tres decimales, guardada en milésimas. Ejemplos: 1, 2,5 horas, 0,125 kg. */
export class Cantidad {
  private constructor(readonly milesimas: number) {}

  static readonly UNO = new Cantidad(ESCALA);

  /** Para rearmar una cantidad guardada. */
  static desdeMilesimas(milesimas: number): Resultado<Cantidad, CantidadInvalida> {
    if (!Number.isSafeInteger(milesimas)) return invalida('formato_invalido');
    if (milesimas <= 0) return invalida('no_positiva');
    return exito(new Cantidad(milesimas));
  }

  static desdeTexto(texto: string): Resultado<Cantidad, CantidadInvalida> {
    const limpio = texto.trim();
    const partes = limpio.split(',');
    const [enteros = '', decimales = ''] = partes;

    if (limpio.length > LONGITUD_MAXIMA || partes.length > 2 || !SOLO_DIGITOS.test(enteros)) {
      return invalida('formato_invalido');
    }
    if (partes.length === 2 && !SOLO_DIGITOS.test(decimales)) return invalida('formato_invalido');
    if (decimales.length > 3) return invalida('demasiados_decimales');

    const milesimas = Number(enteros) * ESCALA + Number(decimales.padEnd(3, '0'));
    if (milesimas === 0) return invalida('no_positiva');

    return exito(new Cantidad(milesimas));
  }

  /** Numerador y denominador para multiplicar un importe por esta cantidad. */
  comoFraccion(): readonly [numerador: number, denominador: number] {
    return [this.milesimas, ESCALA];
  }

  formatear(): string {
    const enteros = String(Math.trunc(this.milesimas / ESCALA));
    const decimales = String(this.milesimas % ESCALA)
      .padStart(3, '0')
      .replace(/0+$/, '');
    return decimales ? `${enteros},${decimales}` : enteros;
  }
}

const invalida = (motivo: MotivoCantidadInvalida) =>
  fallo<CantidadInvalida>({ tipo: 'cantidad_invalida', motivo });
