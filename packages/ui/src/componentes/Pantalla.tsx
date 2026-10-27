import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTema } from '../tema/ProveedorDeTema';

const TODOS_LOS_BORDES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];
const BAJO_EL_ENCABEZADO: readonly Edge[] = ['right', 'bottom', 'left'];

/**
 * Contenedor de cada pantalla: respeta las zonas seguras y usa el fondo del tema. Con encabezado,
 * el margen superior ya lo resuelve la navegación.
 */
export function Pantalla({
  children,
  style,
  conEncabezado = false,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly conEncabezado?: boolean;
}) {
  const { colores } = useTema();
  return (
    <SafeAreaView
      edges={conEncabezado ? BAJO_EL_ENCABEZADO : TODOS_LOS_BORDES}
      style={[{ flex: 1, backgroundColor: colores.background }, style]}
    >
      {children}
    </SafeAreaView>
  );
}
