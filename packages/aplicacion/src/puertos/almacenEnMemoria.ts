import type { AlmacenLocal } from './almacenLocal';
import { validarClaveDeAlmacen, type AlmacenSeguro } from './almacenSeguro';

/** Doble para tests de ambos almacenes. Aplica las mismas reglas de claves que los reales. */
export class AlmacenEnMemoria implements AlmacenSeguro, AlmacenLocal {
  private readonly valores = new Map<string, string>();

  leer(clave: string): Promise<string | undefined> {
    return conClaveValida(clave, () => this.valores.get(clave));
  }

  guardar(clave: string, valor: string): Promise<void> {
    return conClaveValida(clave, () => {
      this.valores.set(clave, valor);
    });
  }

  borrar(clave: string): Promise<void> {
    return conClaveValida(clave, () => {
      this.valores.delete(clave);
    });
  }
}

/** Como el almacén real, una clave inválida rechaza la promesa en lugar de lanzar. */
const conClaveValida = <T>(clave: string, accion: () => T) =>
  new Promise<T>((resolver) => {
    validarClaveDeAlmacen(clave);
    resolver(accion());
  });
