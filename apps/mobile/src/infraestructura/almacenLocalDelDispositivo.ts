import { validarClaveDeAlmacen, type AlmacenLocal } from '@facturador/aplicacion';
import { Directory, File, Paths } from 'expo-file-system';

// La caché del sistema no entra en los respaldos y Android o iOS pueden vaciarla si falta espacio.
// Eso está bien: acá solo se guardan datos que se pueden volver a consultar y preferencias
// cuya pérdida no hace daño.
const carpeta = new Directory(Paths.cache, 'almacen-local');

function archivo(clave: string): File {
  validarClaveDeAlmacen(clave);
  return new File(carpeta, `${clave}.json`);
}

/** Las operaciones de archivo son sincrónicas; así un error rechaza la promesa en lugar de lanzar. */
const enPromesa = <T>(accion: () => T) =>
  new Promise<T>((resolver) => {
    resolver(accion());
  });

export const almacenLocalDelDispositivo: AlmacenLocal = {
  async leer(clave) {
    const destino = archivo(clave);
    return destino.exists ? await destino.text() : undefined;
  },
  guardar(clave, valor) {
    return enPromesa(() => {
      const destino = archivo(clave);
      carpeta.create({ intermediates: true, idempotent: true });
      destino.write(valor);
    });
  },
  borrar(clave) {
    return enPromesa(() => {
      const destino = archivo(clave);
      if (destino.exists) destino.delete();
    });
  },
};
