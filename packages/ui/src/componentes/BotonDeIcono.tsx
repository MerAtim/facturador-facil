import { IconButton } from 'react-native-paper';

/**
 * Botón que solo muestra un ícono. La descripción es obligatoria: es lo que anuncia el lector de
 * pantalla, que no ve el ícono.
 */
export function BotonDeIcono({
  icono,
  descripcion,
  onPress,
}: {
  /** Nombre de un ícono de Material Community Icons. */
  readonly icono: string;
  readonly descripcion: string;
  readonly onPress: () => void;
}) {
  return <IconButton icon={icono} accessibilityLabel={descripcion} onPress={onPress} />;
}
