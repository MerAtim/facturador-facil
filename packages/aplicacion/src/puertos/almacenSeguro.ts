/**
 * Guarda secretos chicos, como el ticket de acceso de ARCA, cifrados en el dispositivo y
 * legibles solo con el dispositivo desbloqueado. No sirve para la clave privada del
 * certificado, que nunca se exporta (ver ADR 0004).
 *
 * Las claves solo admiten letras, números, punto, guion bajo y guion medio.
 */
export interface AlmacenSeguro {
  leer(clave: string): Promise<string | undefined>;
  guardar(clave: string, valor: string): Promise<void>;
  borrar(clave: string): Promise<void>;
}

const CLAVE_VALIDA = /^[\w.-]+$/;

export function validarClaveDeAlmacen(clave: string): void {
  if (!CLAVE_VALIDA.test(clave)) throw new Error(`Clave de almacén inválida: "${clave}"`);
}
