import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio } from '../tema/tokens';

export type VarianteDeBoton = 'principal' | 'secundario' | 'texto';

/** El mínimo de las pautas de accesibilidad de Android para algo que se toca. */
const ALTO_MINIMO = 48;
const TAMANIO_DEL_ICONO = 18;

/**
 * Un solo botón principal por pantalla: la acción que el usuario vino a hacer.
 *
 * Propio y no el de Paper porque aquel corta el texto en una línea: con la fuente grande del
 * teléfono, "Seguir con la puesta en marcha" quedaba a medias. Este parte el texto en renglones.
 * Mientras carga no responde, para que un segundo toque no repita la acción.
 */
export function Boton({
  variante = 'principal',
  icon,
  onPress,
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
  children,
}: {
  readonly variante?: VarianteDeBoton;
  readonly icon?: string;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly children: string;
}) {
  const { colores } = useTema();
  const inactivo = disabled || loading;

  const texto = disabled
    ? colores.onSurfaceDisabled
    : variante === 'principal'
      ? colores.onPrimary
      : colores.primary;
  const fondo =
    variante !== 'principal' ? 'transparent' : disabled ? colores.surfaceDisabled : colores.primary;
  const borde =
    variante === 'secundario'
      ? { borderWidth: 1, borderColor: disabled ? colores.surfaceDisabled : colores.outline }
      : undefined;

  return (
    <View style={[estilos.contorno, borde, { backgroundColor: fondo }, style]}>
      <Pressable
        onPress={onPress}
        disabled={inactivo}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: inactivo, busy: loading }}
        android_ripple={{ color: variante === 'principal' ? colores.onPrimary : colores.primary }}
        style={[estilos.cuerpo, variante === 'texto' && estilos.cuerpoDeTexto]}
      >
        {loading ? (
          <ActivityIndicator size={TAMANIO_DEL_ICONO} color={texto} />
        ) : (
          icon !== undefined && <Icon source={icon} size={TAMANIO_DEL_ICONO} color={texto} />
        )}
        <Text variant="labelLarge" style={[estilos.etiqueta, { color: texto }]}>
          {children}
        </Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  // El recorte va afuera para que el efecto del toque respete las esquinas redondeadas.
  contorno: { borderRadius: ALTO_MINIMO / 2, overflow: 'hidden' },
  cuerpo: {
    minHeight: ALTO_MINIMO,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.chico,
    paddingHorizontal: espacio.grande,
    paddingVertical: espacio.chico,
  },
  cuerpoDeTexto: { paddingHorizontal: espacio.medio },
  etiqueta: { flexShrink: 1, textAlign: 'center' },
});
