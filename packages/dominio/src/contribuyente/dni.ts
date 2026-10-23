import { exito, fallo, type Resultado } from '../compartido/resultado';

export interface DniInvalido {
  readonly tipo: 'dni_invalido';
}

const FORMATO = /^\d{7,8}$/;

export class Dni {
  private constructor(readonly valor: string) {}

  /** Acepta `12345678` o `12.345.678`. */
  static crear(texto: string): Resultado<Dni, DniInvalido> {
    const digitos = texto.trim().replaceAll('.', '');
    return FORMATO.test(digitos) ? exito(new Dni(digitos)) : fallo({ tipo: 'dni_invalido' });
  }
}
