/**
 * La clave privada nunca sale del almacén seguro del dispositivo (ver ADR 0002), así que
 * los adaptadores de ARCA no la reciben: le piden la firma a quien la custodia.
 */
export interface Firmador {
  /** Clave pública RSA en formato SubjectPublicKeyInfo (DER). */
  clavePublica(): Promise<Uint8Array>;
  /** Firma RSASSA PKCS#1 v1.5 con SHA-256 sobre `datos`. */
  firmar(datos: Uint8Array): Promise<Uint8Array>;
}
