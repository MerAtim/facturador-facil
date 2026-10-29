package com.facturadorfacil.tecladoprivado

import android.app.Activity
import android.content.Context
import android.os.Build
import android.view.ViewTreeObserver
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

/**
 * Pone el teclado en modo incógnito en todos los campos de la app: los teclados que respetan
 * IME_FLAG_NO_PERSONALIZED_LEARNING, como Gboard o SwiftKey, no guardan en su diccionario lo que se
 * escribe. Así los nombres, domicilios y CUIT de los clientes no quedan fuera del alcance de la app.
 * La autocorrección sigue funcionando donde el campo la permite.
 *
 * React Native no expone ese flag: se agrega a cada campo cuando recibe el foco.
 */
class TecladoPrivadoModule : Module() {
  private var observada: WeakReference<Activity>? = null

  private val alCambiarElFoco = ViewTreeObserver.OnGlobalFocusChangeListener { _, enfocado ->
    if (enfocado is EditText) sinAprendizaje(enfocado)
  }

  override fun definition() = ModuleDefinition {
    Name("TecladoPrivado")

    // Al arrancar puede no haber llegado todavía el evento de primer plano.
    Function("activar") { observar() }

    // Al volver a primer plano se revisa la actividad, porque el sistema puede haberla recreado.
    OnActivityEntersForeground { observar() }
  }

  private fun observar() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val actividad = appContext.currentActivity ?: return
    if (observada?.get() === actividad) return
    observada = WeakReference(actividad)
    actividad.runOnUiThread {
      actividad.window.decorView.viewTreeObserver.addOnGlobalFocusChangeListener(alCambiarElFoco)
      (actividad.currentFocus as? EditText)?.let(::sinAprendizaje)
    }
  }
}

private fun sinAprendizaje(campo: EditText) {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
  val flag = EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING
  if (campo.imeOptions and flag != 0) return
  campo.imeOptions = campo.imeOptions or flag
  // El teclado ya leyó las opciones del campo al enfocarlo: hay que pedirle que las vuelva a leer.
  val teclados = campo.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
  teclados.restartInput(campo)
}
