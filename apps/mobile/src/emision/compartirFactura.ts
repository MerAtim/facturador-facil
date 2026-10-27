import {
  htmlDelComprobante,
  nombreDelArchivo,
  type DatosDelDocumento,
} from '@facturador/documentos';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Convierte la factura en PDF y abre la hoja de compartir del sistema. El PDF queda en la caché de
 * la app, que no se comparte con otras apps salvo por esta hoja.
 */
export async function compartirFactura(documento: DatosDelDocumento): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: htmlDelComprobante(documento) });

  const destino = new File(
    Paths.cache,
    nombreDelArchivo({
      clase: documento.comprobante.datos.tipo.clase,
      puntoDeVenta: documento.puntoDeVenta,
      numero: documento.numero,
      receptor: documento.receptor.nombre,
    }),
  );
  if (destino.exists) destino.delete();
  await new File(uri).move(destino);

  await Sharing.shareAsync(destino.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Compartir factura',
  });
}
