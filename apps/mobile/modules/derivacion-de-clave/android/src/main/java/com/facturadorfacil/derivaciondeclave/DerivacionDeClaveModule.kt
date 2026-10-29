package com.facturadorfacil.derivaciondeclave

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.experimental.xor

class DerivacionInvalidaException(motivo: String) :
  CodedException("DERIVACION_INVALIDA", motivo, null)

/**
 * PBKDF2-HMAC-SHA256 de 32 bytes, para la clave del respaldo. En JavaScript tardaría demasiado con
 * un costo que proteja; acá usa el HMAC nativo.
 *
 * Se implementa sobre Mac, y no con PBEKeySpec, porque así la contraseña entra exactamente como los
 * bytes UTF-8 que manda la app: según la versión de Android, PBEKeySpec puede codificar distinto
 * los caracteres que no son ASCII, como la ñ, y el respaldo no se abriría en otro teléfono.
 */
class DerivacionDeClaveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DerivacionDeClave")

    AsyncFunction("pbkdf2Sha256") { contrasena: String, sal: String, iteraciones: Int ->
      if (iteraciones < 1) throw DerivacionInvalidaException("Las iteraciones tienen que ser positivas")
      val bytes = Base64.decode(contrasena, Base64.NO_WRAP)
      if (bytes.isEmpty()) throw DerivacionInvalidaException("La contraseña está vacía")
      try {
        Base64.encodeToString(pbkdf2Sha256(bytes, Base64.decode(sal, Base64.NO_WRAP), iteraciones), Base64.NO_WRAP)
      } finally {
        bytes.fill(0)
      }
    }
  }
}

/** RFC 8018, con un único bloque: 32 bytes es justo el largo de SHA-256. */
private fun pbkdf2Sha256(contrasena: ByteArray, sal: ByteArray, iteraciones: Int): ByteArray {
  val hmac = Mac.getInstance("HmacSHA256")
  hmac.init(SecretKeySpec(contrasena, "HmacSHA256"))
  hmac.update(sal)
  hmac.update(byteArrayOf(0, 0, 0, 1))
  var u = hmac.doFinal()
  val clave = u.copyOf()
  repeat(iteraciones - 1) {
    u = hmac.doFinal(u)
    for (i in clave.indices) clave[i] = clave[i] xor u[i]
  }
  return clave
}
