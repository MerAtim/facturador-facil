import { aBase64, desdeBase64 } from '@facturador/arca';
import {
  esLogoValido,
  inspeccionarImagen,
  tamanioDelLogo,
  TAMANIO_MAXIMO_DE_LA_IMAGEN,
  type MotivoImagenInvalida,
} from '@facturador/documentos';
import { exito, fallo, type Resultado } from '@facturador/dominio';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** En los documentos de la app, fuera del alcance de otras apps. */
const archivo = () => new File(Paths.document, 'logo.png');

export type MotivoLogoRechazado = MotivoImagenInvalida | 'no_se_pudo_procesar';

/**
 * Valida la imagen elegida por su contenido y la vuelve a codificar como un PNG chico antes de
 * guardarla: lo que se guarda lo generó la app, no es el archivo que llegó de afuera. Así se
 * descartan metadatos (como la ubicación de una foto) y cualquier contenido extra del original.
 */
export async function guardarLogo(
  uri: string,
  tamanioInformado?: number,
): Promise<Resultado<string, MotivoLogoRechazado>> {
  const original = new File(uri);
  // El tamaño se mira antes de leerlo, para no cargar en memoria un archivo enorme.
  if ((tamanioInformado ?? original.size) > TAMANIO_MAXIMO_DE_LA_IMAGEN) {
    return fallo('archivo_demasiado_grande');
  }
  const imagen = inspeccionarImagen(await original.bytes());
  if (!imagen.ok) return imagen;

  let generado: File | undefined;
  try {
    const contexto = ImageManipulator.manipulate(uri);
    const { ancho, alto } = tamanioDelLogo(imagen.valor);
    contexto.resize({ width: ancho, height: alto });
    const renderizada = await contexto.renderAsync();
    const resultado = await renderizada.saveAsync({ format: SaveFormat.PNG, base64: true });
    generado = new File(resultado.uri);
    const base64 = resultado.base64 ?? '';
    const bytes = desdeBase64(base64);
    if (!esLogoValido(bytes)) return fallo('no_se_pudo_procesar');

    // Se guardan los bytes que se acaban de validar, no el archivo intermedio.
    const destino = archivo();
    if (destino.exists) destino.delete();
    destino.write(bytes);
    return exito(base64);
  } finally {
    if (generado?.exists) generado.delete();
  }
}

/** El logo guardado en base64, listo para el documento. Si no hay uno válido, undefined. */
export async function leerLogo(): Promise<string | undefined> {
  const guardado = archivo();
  if (!guardado.exists) return undefined;
  const bytes = await guardado.bytes();
  return esLogoValido(bytes) ? aBase64(bytes) : undefined;
}

export function quitarLogo(): void {
  const guardado = archivo();
  if (guardado.exists) guardado.delete();
}
