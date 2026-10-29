import CommonCrypto
import ExpoModulesCore

final class DerivacionInvalidaException: GenericException<String> {
  override var reason: String { param }
}

/// PBKDF2-HMAC-SHA256 de 32 bytes, para la clave del respaldo. En JavaScript tardaría demasiado
/// con un costo que proteja; acá usa CommonCrypto. La contraseña llega como los bytes UTF-8 que
/// manda la app, igual que en Android, así el respaldo se abre en cualquier teléfono.
public class DerivacionDeClaveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DerivacionDeClave")

    AsyncFunction("pbkdf2Sha256") { (contrasena: String, sal: String, iteraciones: Int) throws -> String in
      guard iteraciones >= 1, iteraciones <= Int(UInt32.max) else {
        throw DerivacionInvalidaException("Las iteraciones tienen que ser positivas")
      }
      guard var bytes = Data(base64Encoded: contrasena), !bytes.isEmpty,
        let salt = Data(base64Encoded: sal)
      else {
        throw DerivacionInvalidaException("La contraseña o la sal no son válidas")
      }
      defer { bytes.resetBytes(in: 0..<bytes.count) }

      var clave = Data(count: 32)
      let estado = clave.withUnsafeMutableBytes { destino in
        bytes.withUnsafeBytes { secreto in
          salt.withUnsafeBytes { semilla in
            CCKeyDerivationPBKDF(
              CCPBKDFAlgorithm(kCCPBKDF2),
              secreto.baseAddress?.assumingMemoryBound(to: Int8.self), bytes.count,
              semilla.baseAddress?.assumingMemoryBound(to: UInt8.self), salt.count,
              CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(iteraciones),
              destino.baseAddress?.assumingMemoryBound(to: UInt8.self), 32)
          }
        }
      }
      guard estado == kCCSuccess else {
        throw DerivacionInvalidaException("No se pudo derivar la clave")
      }
      return clave.base64EncodedString()
    }
  }
}
