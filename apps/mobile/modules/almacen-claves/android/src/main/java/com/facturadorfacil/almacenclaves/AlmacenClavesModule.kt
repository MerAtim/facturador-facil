package com.facturadorfacil.almacenclaves

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature

private const val PROVEEDOR = "AndroidKeyStore"

class ClaveExistenteException(alias: String) :
  CodedException("CLAVE_EXISTENTE", "Ya existe una clave con el alias $alias", null)

class ClaveInexistenteException(alias: String) :
  CodedException("CLAVE_INEXISTENTE", "No existe una clave con el alias $alias", null)

/**
 * Claves RSA en Android Keystore. La clave privada no se puede exportar: solo se le pide
 * que firme. Los bytes viajan en base64 entre JS y nativo.
 */
class AlmacenClavesModule : Module() {
  private val almacen: KeyStore
    get() = KeyStore.getInstance(PROVEEDOR).apply { load(null) }

  override fun definition() = ModuleDefinition {
    Name("AlmacenClaves")

    Function("existeClave") { alias: String ->
      almacen.containsAlias(alias)
    }

    AsyncFunction("generarClave") { alias: String ->
      // Regenerar pisaría la clave del certificado vigente, así que se exige borrarla antes.
      if (almacen.containsAlias(alias)) throw ClaveExistenteException(alias)
      try {
        generar(alias, enStrongBox = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
      } catch (e: StrongBoxUnavailableException) {
        generar(alias, enStrongBox = false)
      }
    }

    AsyncFunction("clavePublica") { alias: String ->
      val certificado = almacen.getCertificate(alias) ?: throw ClaveInexistenteException(alias)
      // getEncoded devuelve SubjectPublicKeyInfo en DER.
      Base64.encodeToString(certificado.publicKey.encoded, Base64.NO_WRAP)
    }

    AsyncFunction("firmar") { alias: String, datos: String ->
      val clave = almacen.getKey(alias, null) as? PrivateKey ?: throw ClaveInexistenteException(alias)
      val firma = Signature.getInstance("SHA256withRSA").apply {
        initSign(clave)
        update(Base64.decode(datos, Base64.NO_WRAP))
      }
      Base64.encodeToString(firma.sign(), Base64.NO_WRAP)
    }

    AsyncFunction("eliminarClave") { alias: String ->
      almacen.deleteEntry(alias)
    }
  }

  private fun generar(alias: String, enStrongBox: Boolean) {
    val especificacion = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setKeySize(2048)
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
      .apply { if (enStrongBox) setIsStrongBoxBacked(true) }
      // Con la pantalla bloqueada, el Keystore se niega a firmar: aunque algo corra como la app,
      // no puede usar la clave sin que el dueño desbloquee el teléfono. Igual que
      // WhenUnlockedThisDeviceOnly en iOS. Antes de Android 9 no existe.
      .apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) setUnlockedDeviceRequired(true)
      }
      .build()

    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, PROVEEDOR).run {
      initialize(especificacion)
      generateKeyPair()
    }
  }
}
