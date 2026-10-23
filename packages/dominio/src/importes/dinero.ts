import { exito, fallo, type Resultado } from '../compartido/resultado';

export type MotivoImporteInvalido = 'formato_invalido' | 'demasiados_decimales' | 'fuera_de_rango';

export interface ImporteInvalido {
  readonly tipo: 'importe_invalido';
  readonly motivo: MotivoImporteInvalido;
}

const SOLO_DIGITOS = /^\d+$/;
const LONGITUD_MAXIMA = 30;

/**
 * Importe no negativo en pesos, guardado como centavos enteros para evitar
 * los errores de redondeo del punto flotante.
 */
export class Dinero {
  private constructor(readonly centavos: number) {}

  static readonly CERO = new Dinero(0);

  static desdeCentavos(centavos: number): Resultado<Dinero, ImporteInvalido> {
    if (!Number.isSafeInteger(centavos) || centavos < 0) return invalido('fuera_de_rango');
    return exito(new Dinero(centavos));
  }

  /** Interpreta texto en formato argentino: `1.234,56`, `1234,5` o `$ 1.234`. */
  static desdeTexto(texto: string): Resultado<Dinero, ImporteInvalido> {
    const limpio = texto.replace('$', '').trim();
    if (limpio.length > LONGITUD_MAXIMA) return invalido('fuera_de_rango');

    const partes = limpio.split(',');
    const [parteEntera = '', decimales = ''] = partes;
    const enteros = quitarSeparadorDeMiles(parteEntera);

    if (partes.length > 2 || enteros === undefined) return invalido('formato_invalido');
    if (partes.length === 2 && !SOLO_DIGITOS.test(decimales)) return invalido('formato_invalido');
    if (decimales.length > 2) return invalido('demasiados_decimales');

    return Dinero.desdeCentavos(Number(enteros) * 100 + Number(decimales.padEnd(2, '0')));
  }

  sumar(otro: Dinero): Dinero {
    return new Dinero(this.centavos + otro.centavos);
  }

  restar(otro: Dinero): Resultado<Dinero, ImporteInvalido> {
    return Dinero.desdeCentavos(this.centavos - otro.centavos);
  }

  /**
   * Multiplica por `numerador / denominador` y redondea al centavo, con las mitades hacia arriba.
   * Es la única operación que redondea, así toda regla de cálculo pasa por el mismo criterio.
   */
  multiplicarPorFraccion(numerador: number, denominador: number): Dinero {
    if (
      !Number.isSafeInteger(numerador) ||
      !Number.isSafeInteger(denominador) ||
      numerador < 0 ||
      denominador <= 0
    ) {
      throw new RangeError('La fracción debe tener enteros no negativos y denominador positivo');
    }

    // floor(c × n / d + 1/2) en aritmética entera: floor((2 × c × n + d) / (2 × d))
    const doble = 2n * BigInt(this.centavos) * BigInt(numerador);
    const d = BigInt(denominador);
    return new Dinero(Number((doble + d) / (2n * d)));
  }

  esCero(): boolean {
    return this.centavos === 0;
  }

  esIgualA(otro: Dinero): boolean {
    return this.centavos === otro.centavos;
  }

  /** Formato que esperan los web services de ARCA: punto decimal y dos decimales. */
  aTextoArca(): string {
    return `${String(Math.trunc(this.centavos / 100))}.${this.decimales()}`;
  }

  /** Formato para mostrar: `$ 1.234,56` */
  formatear(): string {
    return `$ ${agruparMiles(String(Math.trunc(this.centavos / 100)))},${this.decimales()}`;
  }

  private decimales(): string {
    return String(this.centavos % 100).padStart(2, '0');
  }
}

const invalido = (motivo: MotivoImporteInvalido) =>
  fallo<ImporteInvalido>({ tipo: 'importe_invalido', motivo });

/** Acepta `1234` o `1.234` con grupos de tres dígitos. Devuelve solo los dígitos. */
function quitarSeparadorDeMiles(texto: string): string | undefined {
  const [primero = '', ...resto] = texto.split('.');
  const conGruposValidos =
    resto.length === 0 ||
    (primero.length <= 3 && resto.every((grupo) => grupo.length === 3 && SOLO_DIGITOS.test(grupo)));

  return SOLO_DIGITOS.test(primero) && conGruposValidos ? primero + resto.join('') : undefined;
}

function agruparMiles(digitos: string): string {
  const grupos: string[] = [];
  for (let fin = digitos.length; fin > 0; fin -= 3) {
    grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin));
  }
  return grupos.join('.');
}
