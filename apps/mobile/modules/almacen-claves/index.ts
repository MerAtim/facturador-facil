import { requireNativeModule } from 'expo';

interface AlmacenClaves {
  existeClave(alias: string): boolean;
  /** Falla con CLAVE_EXISTENTE si el alias ya tiene una clave. */
  generarClave(alias: string): Promise<void>;
  /** SubjectPublicKeyInfo en DER, codificado en base64. */
  clavePublica(alias: string): Promise<string>;
  /** Firma RSASSA PKCS#1 v1.5 con SHA-256. Recibe y devuelve base64. */
  firmar(alias: string, datos: string): Promise<string>;
  eliminarClave(alias: string): Promise<void>;
}

export default requireNativeModule<AlmacenClaves>('AlmacenClaves');
