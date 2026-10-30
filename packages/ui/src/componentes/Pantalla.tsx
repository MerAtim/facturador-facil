import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Keyboard, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTema } from '../tema/ProveedorDeTema';

const TODOS_LOS_BORDES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];
const BAJO_EL_ENCABEZADO: readonly Edge[] = ['right', 'bottom', 'left'];

/**
 * Contenedor de cada pantalla: respeta las zonas seguras y usa el fondo del tema. Con encabezado,
 * el margen superior ya lo resuelve la navegación.
 *
 * Deja lugar para el teclado: desde Android 15 la app se dibuja de borde a borde y el sistema ya no
 * achica la pantalla al abrirlo, así que el final de un formulario, con su botón, quedaba debajo.
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
  const contenido = useRef<View>(null);
  const tapado = useAltoTapadoPorElTeclado(contenido);
  return (
    <SafeAreaView
      edges={conEncabezado ? BAJO_EL_ENCABEZADO : TODOS_LOS_BORDES}
      style={[{ flex: 1, backgroundColor: colores.background }, style]}
    >
      <View ref={contenido} style={{ flex: 1, paddingBottom: tapado }}>
        {children}
      </View>
    </SafeAreaView>
  );
}

/** Cuánto del contenido queda debajo del teclado abierto, en puntos. */
function useAltoTapadoPorElTeclado(contenido: RefObject<View | null>): number {
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    // En iOS el aviso llega antes de la animación y el lugar se abre junto con el teclado.
    const alMostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const alOcultar = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const mostrar = Keyboard.addListener(alMostrar, ({ endCoordinates }) => {
      contenido.current?.measureInWindow((_x, y, _ancho, altoDelContenido) => {
        setAlto(Math.max(0, y + altoDelContenido - endCoordinates.screenY));
      });
    });
    const ocultar = Keyboard.addListener(alOcultar, () => {
      setAlto(0);
    });
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, [contenido]);

  return alto;
}
