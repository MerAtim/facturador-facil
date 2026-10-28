import {
  htmlDelComprobante,
  nombreDelArchivo,
  type DatosDelDocumento,
} from '@facturador/documentos';
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';

import CompartirArchivo from '../../modules/compartir-archivo';
import { leerLogo } from '../logo/logoDelEmisor';

/** La única carpeta que la app expone a otras apps, y solo por la hoja de compartir. */
const compartidos = new Directory(Paths.cache, 'compartidos');

/**
 * Convierte la factura en PDF y abre la hoja de compartir del sistema con el mensaje para el
 * cliente. El PDF queda en la caché de la app.
 */
export async function compartirFactura(
  documento: DatosDelDocumento,
  mensaje: string,
): Promise<void> {
  // Sin logo, o si no se puede leer, la factura sale igual.
  const logo = await leerLogo().catch(() => undefined);
  const { uri } = await Print.printToFileAsync({
    html: htmlDelComprobante(logo === undefined ? documento : { ...documento, logo }),
  });

  compartidos.create({ intermediates: true, idempotent: true });
  const destino = new File(
    compartidos,
    nombreDelArchivo({
      clase: documento.comprobante.datos.tipo.clase,
      puntoDeVenta: documento.puntoDeVenta,
      numero: documento.numero,
      receptor: documento.receptor.nombre,
    }),
  );
  if (destino.exists) destino.delete();
  await new File(uri).move(destino);

  await CompartirArchivo.compartir(destino.uri, 'application/pdf', mensaje, 'Compartir factura');
}
