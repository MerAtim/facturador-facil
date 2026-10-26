import ExpoModulesCore
import Security

final class ClaveExistenteException: GenericException<String> {
  override var reason: String { "Ya existe una clave con el alias \(param)" }
}

final class ClaveInexistenteException: GenericException<String> {
  override var reason: String { "No existe una clave con el alias \(param)" }
}

final class KeychainException: GenericException<String> {
  override var reason: String { "Error del Keychain: \(param)" }
}

/// Claves RSA en el Keychain, accesibles solo con el dispositivo desbloqueado y sin
/// sincronizarse a otros equipos. Los bytes viajan en base64 entre JS y nativo.
public class AlmacenClavesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AlmacenClaves")

    Function("existeClave") { (alias: String) -> Bool in
      buscar(alias) != nil
    }

    AsyncFunction("generarClave") { (alias: String) in
      // Regenerar pisaría la clave del certificado vigente, así que se exige borrarla antes.
      if buscar(alias) != nil { throw ClaveExistenteException(alias) }

      let atributos: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
        kSecAttrKeySizeInBits as String: 2048,
        kSecPrivateKeyAttrs as String: [
          kSecAttrIsPermanent as String: true,
          kSecAttrApplicationTag as String: etiqueta(alias),
          kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ],
      ]
      var error: Unmanaged<CFError>?
      guard SecKeyCreateRandomKey(atributos as CFDictionary, &error) != nil else {
        throw KeychainException(describir(error))
      }
    }

    AsyncFunction("clavePublica") { (alias: String) -> String in
      guard let privada = buscar(alias), let publica = SecKeyCopyPublicKey(privada) else {
        throw ClaveInexistenteException(alias)
      }
      var error: Unmanaged<CFError>?
      guard let pkcs1 = SecKeyCopyExternalRepresentation(publica, &error) as Data? else {
        throw KeychainException(describir(error))
      }
      return subjectPublicKeyInfo(pkcs1).base64EncodedString()
    }

    AsyncFunction("firmar") { (alias: String, datos: String) -> String in
      guard let privada = buscar(alias) else { throw ClaveInexistenteException(alias) }
      guard let bytes = Data(base64Encoded: datos) else { throw KeychainException("base64 inválido") }
      var error: Unmanaged<CFError>?
      guard
        let firma = SecKeyCreateSignature(
          privada, .rsaSignatureMessagePKCS1v15SHA256, bytes as CFData, &error) as Data?
      else {
        throw KeychainException(describir(error))
      }
      return firma.base64EncodedString()
    }

    AsyncFunction("eliminarClave") { (alias: String) in
      SecItemDelete(consulta(alias) as CFDictionary)
    }
  }

  private func etiqueta(_ alias: String) -> Data {
    Data("com.facturadorfacil.\(alias)".utf8)
  }

  private func consulta(_ alias: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassKey,
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrApplicationTag as String: etiqueta(alias),
    ]
  }

  private func buscar(_ alias: String) -> SecKey? {
    var resultado: CFTypeRef?
    var pedido = consulta(alias)
    pedido[kSecReturnRef as String] = true
    guard SecItemCopyMatching(pedido as CFDictionary, &resultado) == errSecSuccess else { return nil }
    // swiftlint:disable:next force_cast
    return (resultado as! SecKey)
  }

  private func describir(_ error: Unmanaged<CFError>?) -> String {
    error.map { String(describing: $0.takeRetainedValue()) } ?? "desconocido"
  }

  /// El Keychain exporta la clave pública como RSAPublicKey (PKCS#1). Se envuelve en
  /// SubjectPublicKeyInfo para que ambas plataformas entreguen el mismo formato.
  private func subjectPublicKeyInfo(_ pkcs1: Data) -> Data {
    let algoritmo = Data([
      0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
    ])
    let cadenaBits = tlv(0x03, Data([0x00]) + pkcs1)
    return tlv(0x30, algoritmo + cadenaBits)
  }

  private func tlv(_ etiqueta: UInt8, _ contenido: Data) -> Data {
    var longitud = Data()
    if contenido.count < 0x80 {
      longitud.append(UInt8(contenido.count))
    } else {
      var bytes: [UInt8] = []
      var resto = contenido.count
      while resto > 0 {
        bytes.insert(UInt8(resto & 0xff), at: 0)
        resto >>= 8
      }
      longitud.append(0x80 | UInt8(bytes.count))
      longitud.append(contentsOf: bytes)
    }
    return Data([etiqueta]) + longitud + contenido
  }
}
