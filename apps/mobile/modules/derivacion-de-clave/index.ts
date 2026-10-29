import { requireNativeModule } from 'expo';

interface DerivacionDeClave {
  /**
   * PBKDF2-HMAC-SHA256 de 32 bytes. La contraseña son sus bytes UTF-8; todo va y vuelve en base64,
   * así los bytes cruzan al código nativo sin conversiones de texto.
   */
  pbkdf2Sha256(contrasena: string, sal: string, iteraciones: number): Promise<string>;
}

export default requireNativeModule<DerivacionDeClave>('DerivacionDeClave');
