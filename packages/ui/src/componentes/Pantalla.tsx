import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTema } from '../tema/ProveedorDeTema';

/** Contenedor de cada pantalla: respeta las zonas seguras y usa el fondo del tema. */
export function Pantalla({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colores.background }, style]}>
      {children}
    </SafeAreaView>
  );
}
