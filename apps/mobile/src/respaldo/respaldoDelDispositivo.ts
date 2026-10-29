import { crearRespaldo } from '@facturador/aplicacion';
import { aBase64, desdeBase64 } from '@facturador/arca';
import { crearCifradoDeRespaldos } from '@facturador/respaldo';
import { getRandomBytes } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import CompartirArchivo from '../../modules/compartir-archivo';
import DerivacionDeClave from '../../modules/derivacion-de-clave';
import { clientes, comprobantesEmitidos } from '../composicion';
import { repositorioDeConfiguracion } from '../configuracion/configuracion';
import { guardarLogo, leerLogo } from '../logo/logoDelEmisor';

/** Un logo que llega en un respaldo pasa por la misma validación que uno elegido en pantalla. */
async function guardarLogoDelRespaldo(base64: string): Promise<void> {
  const temporal = new File(Paths.cache, 'logo-del-respaldo.png');
  try {
    if (temporal.exists) temporal.delete();
    temporal.write(desdeBase64(base64));
    const guardado = await guardarLogo(temporal.uri);
    if (!guardado.ok) throw new Error(`Logo del respaldo rechazado: ${guardado.error}`);
  } finally {
    if (temporal.exists) temporal.delete();
  }
}

export const respaldo = crearRespaldo({
  configuracion: repositorioDeConfiguracion,
  clientes,
  comprobantes: comprobantesEmitidos,
  logo: { leer: leerLogo, guardar: guardarLogoDelRespaldo },
  cifrado: crearCifradoDeRespaldos({
    aleatorio: (cantidad) => getRandomBytes(cantidad),
    derivar: async (contrasena, sal, iteraciones) =>
      desdeBase64(
        await DerivacionDeClave.pbkdf2Sha256(aBase64(contrasena), aBase64(sal), iteraciones),
      ),
  }),
  ahora: () => new Date(),
});

/** La única carpeta que la app expone a otras apps, y solo por la hoja de compartir. */
const compartidos = new Directory(Paths.cache, 'compartidos');

/** Guarda el respaldo en la caché y abre la hoja de compartir para mandarlo a donde lo guarde. */
export async function compartirRespaldo(archivo: Uint8Array, fecha: string): Promise<void> {
  compartidos.create({ intermediates: true, idempotent: true });
  const destino = new File(compartidos, `respaldo-facturador-${fecha}.ffresp`);
  if (destino.exists) destino.delete();
  destino.write(archivo);
  await CompartirArchivo.compartir(
    destino.uri,
    'application/octet-stream',
    'Respaldo cifrado de Facturador Fácil.',
    'Guardar respaldo',
  );
}
