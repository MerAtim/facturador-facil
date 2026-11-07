import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { Keyboard, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from 'react-native-paper';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio } from '../tema/tokens';

const TODOS_LOS_BORDES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];
const BAJO_EL_ENCABEZADO: readonly Edge[] = ['right', 'bottom', 'left'];

/**
 * Contenedor de cada pantalla: respeta las zonas seguras y usa el fondo del tema. Con encabezado,
 * el margen superior ya lo resuelve la navegación.
 *
 * Deja lugar para el teclado: desde Android 15 la app se dibuja de borde a borde y el sistema ya no
 * achica la pantalla al abrirlo, así que el final de un formulario, con su botón, quedaba debajo.
 *
 * En iOS suma sobre el teclado una barra con "Listo": el teclado numérico no tiene tecla para
 * cerrarse y, abierto, tapa el final del formulario.
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
  const contenido = useRef<ComponentRef<typeof View>>(null);
  const { alto: tapado, abierto } = useAltoTapadoPorElTeclado(contenido);
  return (
    <SafeAreaView
      edges={conEncabezado ? BAJO_EL_ENCABEZADO : TODOS_LOS_BORDES}
      style={[{ flex: 1, backgroundColor: colores.background }, style]}
    >
      <View ref={contenido} style={{ flex: 1, paddingBottom: tapado }}>
        <View style={estilos.contenido}>{children}</View>
        {Platform.OS === 'ios' && abierto && <BarraDelTeclado />}
      </View>
    </SafeAreaView>
  );
}

/** Queda pegada arriba del teclado porque el contenido termina donde él empieza. */
function BarraDelTeclado() {
  const { colores } = useTema();
  return (
    <View
      style={[
        estilos.barra,
        { backgroundColor: colores.surfaceVariant, borderTopColor: colores.outlineVariant },
      ]}
    >
      <Button
        mode="text"
        onPress={() => {
          Keyboard.dismiss();
        }}
        accessibilityLabel="Listo, cerrar el teclado"
      >
        Listo
      </Button>
    </View>
  );
}

/** Cuánto del contenido queda debajo del teclado abierto, en puntos. */
function useAltoTapadoPorElTeclado(contenido: RefObject<ComponentRef<typeof View> | null>): {
  readonly alto: number;
  readonly abierto: boolean;
} {
  const [alto, setAlto] = useState(0);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    // En iOS el aviso llega antes de la animación y el lugar se abre junto con el teclado.
    const alMostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const alOcultar = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const mostrar = Keyboard.addListener(alMostrar, ({ endCoordinates }) => {
      setAbierto(true);
      contenido.current?.measureInWindow((_x, y, _ancho, altoDelContenido) => {
        setAlto(Math.max(0, y + altoDelContenido - endCoordinates.screenY));
      });
    });
    const ocultar = Keyboard.addListener(alOcultar, () => {
      setAbierto(false);
      setAlto(0);
    });
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, [contenido]);

  return { alto, abierto };
}

const estilos = StyleSheet.create({
  contenido: { flex: 1 },
  barra: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: espacio.chico,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
