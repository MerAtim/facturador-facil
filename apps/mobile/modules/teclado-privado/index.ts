import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';

interface TecladoPrivado {
  /** Pone el teclado en modo incógnito en todos los campos de la app. Llamarla de nuevo no hace nada. */
  activar(): void;
}

/** Solo Android tiene el modo incógnito del teclado; en iOS no hace nada. */
export function activarTecladoPrivado(): void {
  if (Platform.OS !== 'android') return;
  requireNativeModule<TecladoPrivado>('TecladoPrivado').activar();
}
