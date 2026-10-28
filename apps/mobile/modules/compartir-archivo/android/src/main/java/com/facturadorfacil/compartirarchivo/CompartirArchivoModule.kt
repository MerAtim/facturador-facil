package com.facturadorfacil.compartirarchivo

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Carpeta de la caché, la única que el FileProvider expone. */
const val CARPETA_COMPARTIDA = "compartidos"

class ArchivoNoCompartibleException(ruta: String) :
  CodedException("ARCHIVO_NO_COMPARTIBLE", "Solo se comparten archivos de la caché de la app: $ruta", null)

/**
 * Comparte un archivo con la hoja del sistema junto con un mensaje. Las apps que lo admiten, como
 * WhatsApp o el correo, usan el mensaje como texto que acompaña al archivo.
 */
class CompartirArchivoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CompartirArchivo")

    AsyncFunction("compartir") { ruta: String, tipo: String, mensaje: String, titulo: String ->
      val contexto = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val actividad = appContext.currentActivity ?: throw Exceptions.MissingActivity()

      val carpeta = File(contexto.cacheDir, CARPETA_COMPARTIDA).canonicalFile
      val archivo = File(Uri.parse(ruta).path ?: ruta).canonicalFile
      if (!archivo.path.startsWith(carpeta.path + File.separator) || !archivo.isFile) {
        throw ArchivoNoCompartibleException(ruta)
      }

      val uri = FileProvider.getUriForFile(contexto, "${contexto.packageName}.compartir", archivo)
      val envio = Intent(Intent.ACTION_SEND).apply {
        type = tipo
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, mensaje)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      actividad.startActivity(Intent.createChooser(envio, titulo))
    }
  }
}
