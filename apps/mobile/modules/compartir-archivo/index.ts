import { requireNativeModule } from 'expo';

interface CompartirArchivo {
  /**
   * Abre la hoja de compartir del sistema con el archivo y un mensaje. El archivo tiene que estar
   * en la carpeta `compartidos` de la caché de la app: es la única que se expone a otras apps.
   */
  compartir(ruta: string, tipo: string, mensaje: string, titulo: string): Promise<void>;
}

export default requireNativeModule<CompartirArchivo>('CompartirArchivo');
