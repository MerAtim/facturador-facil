import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

import { registro } from '../composicion';

/**
 * Casi todas las pantallas muestran datos fiscales (CUIT, clientes, importes, CAE), así que la
 * protección vale para toda la app:
 *
 * - Android marca la ventana como segura: bloquea capturas y grabaciones, y el selector de apps
 *   muestra la vista previa en blanco.
 * - iOS no puede impedir una captura, pero la oculta en las grabaciones y desenfoca la vista
 *   previa del selector de apps.
 *
 * En desarrollo queda desactivada para poder capturar la pantalla al probar. Para la factura, el
 * usuario tiene el PDF.
 */
export async function protegerLaPantalla(): Promise<void> {
  if (__DEV__) return;
  try {
    await ScreenCapture.preventScreenCaptureAsync();
    if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(1);
  } catch (error) {
    registro.error('no se pudo proteger la pantalla', error);
  }
}
