import { exito, fallo, type Resultado } from '../compartido/resultado';

export type MotivoCuitInvalido =
  'caracteres_invalidos' | 'longitud_invalida' | 'prefijo_invalido' | 'digito_verificador_invalido';

export interface CuitInvalido {
  readonly tipo: 'cuit_invalido';
  readonly motivo: MotivoCuitInvalido;
}

const PREFIJOS_VALIDOS = new Set(['20', '23', '24', '25', '26', '27', '30', '33', '34']);
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
const SEPARADORES = /[\s-]/g;

export class Cuit {
  private constructor(readonly valor: string) {}

  static crear(texto: string): Resultado<Cuit, CuitInvalido> {
    const digitos = texto.trim().replace(SEPARADORES, '');

    if (!/^\d*$/.test(digitos)) return invalido('caracteres_invalidos');
    if (digitos.length !== 11) return invalido('longitud_invalida');
    if (!PREFIJOS_VALIDOS.has(digitos.slice(0, 2))) return invalido('prefijo_invalido');
    if (calcularDigitoVerificador(digitos) !== Number(digitos[10])) {
      return invalido('digito_verificador_invalido');
    }

    return exito(new Cuit(digitos));
  }

  /** Formato de lectura habitual: 20-12345678-6 */
  formateado(): string {
    return `${this.valor.slice(0, 2)}-${this.valor.slice(2, 10)}-${this.valor.slice(10)}`;
  }

  esIgualA(otro: Cuit): boolean {
    return this.valor === otro.valor;
  }
}

const invalido = (motivo: MotivoCuitInvalido) =>
  fallo<CuitInvalido>({ tipo: 'cuit_invalido', motivo });

/**
 * Módulo 11 sobre los primeros 10 dígitos. Un resultado de 10 nunca es válido:
 * en ese caso ARCA asigna otro prefijo (23 o 33) en lugar de usar ese dígito.
 */
function calcularDigitoVerificador(digitos: string): number {
  const suma = PESOS.reduce((total, peso, i) => total + peso * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  return resto === 11 ? 0 : resto;
}
