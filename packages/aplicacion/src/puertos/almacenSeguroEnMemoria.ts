import { validarClaveDeAlmacen, type AlmacenSeguro } from './almacenSeguro';

/** Doble para tests. Aplica las mismas reglas de claves que el almacén real. */
export class AlmacenSeguroEnMemoria implements AlmacenSeguro {
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
