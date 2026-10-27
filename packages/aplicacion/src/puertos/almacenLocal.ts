/**
 * Guarda datos no sensibles que conviene conservar entre reinicios, como los parámetros de ARCA.
 * Nada de lo que se guarda acá está cifrado: los secretos van en el AlmacenSeguro.
 *
 * Las claves siguen las mismas reglas que las del AlmacenSeguro.
 */
export interface AlmacenLocal {
  leer(clave: string): Promise<string | undefined>;
  guardar(clave: string, valor: string): Promise<void>;
  borrar(clave: string): Promise<void>;
}
