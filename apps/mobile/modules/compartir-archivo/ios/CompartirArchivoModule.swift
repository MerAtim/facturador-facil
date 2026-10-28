import ExpoModulesCore
import UIKit

final class ArchivoNoCompartibleException: GenericException<String> {
  override var reason: String { "Solo se comparten archivos de la caché de la app: \(param)" }
}

/// Comparte un archivo con la hoja del sistema junto con un mensaje. Las apps que lo admiten, como
/// WhatsApp o Mail, usan el mensaje como texto que acompaña al archivo.
public class CompartirArchivoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CompartirArchivo")

    AsyncFunction("compartir") {
      (ruta: String, tipo: String, mensaje: String, titulo: String, promesa: Promise) in
      let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      let carpeta = cache.appendingPathComponent("compartidos", isDirectory: true).standardizedFileURL
      guard let url = URL(string: ruta)?.standardizedFileURL,
        url.isFileURL,
        url.path.hasPrefix(carpeta.path + "/"),
        FileManager.default.fileExists(atPath: url.path)
      else {
        promesa.reject(ArchivoNoCompartibleException(ruta))
        return
      }

      guard let presentador = self.appContext?.utilities?.currentViewController() else {
        promesa.reject(MissingCurrentViewControllerException())
        return
      }
      let hoja = UIActivityViewController(activityItems: [mensaje, url], applicationActivities: nil)
      // En iPad la hoja es un popover y necesita un ancla.
      hoja.popoverPresentationController?.sourceView = presentador.view
      hoja.completionWithItemsHandler = { _, _, _, _ in promesa.resolve(nil) }
      presentador.present(hoja, animated: true)
    }.runOnQueue(.main)
  }
}
