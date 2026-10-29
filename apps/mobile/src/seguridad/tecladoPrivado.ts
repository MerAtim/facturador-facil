import { activarTecladoPrivado } from '../../modules/teclado-privado';
import { registro } from '../composicion';

/**
 * Los teclados aprenden lo que se escribe para sugerirlo después, también fuera de la app. En
 * Android se les pide no aprender nada de lo que se escribe acá; los campos con datos de personas
 * además desactivan las sugerencias, lo que también vale en iOS.
 */
export function protegerElTeclado(): void {
  try {
    activarTecladoPrivado();
  } catch (error) {
    registro.error('no se pudo activar el teclado privado', error);
  }
}
