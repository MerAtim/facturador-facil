import { validarClaveDeAlmacen, type AlmacenSeguro } from '@facturador/aplicacion';
import * as SecureStore from 'expo-secure-store';

// iOS: Keychain, solo con el dispositivo desbloqueado y sin pasar a otros equipos.
// Android: cifrado con una clave de Keystore. El plugin de expo-secure-store excluye
// estos datos de los respaldos del sistema.
const OPCIONES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const almacenSeguroDelDispositivo: AlmacenSeguro = {
  async leer(clave) {
    validarClaveDeAlmacen(clave);
    return (await SecureStore.getItemAsync(clave, OPCIONES)) ?? undefined;
  },
  async guardar(clave, valor) {
    validarClaveDeAlmacen(clave);
    await SecureStore.setItemAsync(clave, valor, OPCIONES);
  },
  async borrar(clave) {
    validarClaveDeAlmacen(clave);
    await SecureStore.deleteItemAsync(clave, OPCIONES);
  },
};
