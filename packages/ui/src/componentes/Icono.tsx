import { Icon } from 'react-native-paper';

/**
 * Ícono decorativo, que acompaña a un texto. Si el ícono transmite algo por sí solo, el texto
 * accesible tiene que decirlo en el elemento que lo contiene.
 */
export function Icono({
  nombre,
  color,
  tamanio = 20,
}: {
  /** Nombre de un ícono de Material Community Icons. */
  readonly nombre: string;
  readonly color: string;
  readonly tamanio?: number;
}) {
  return <Icon source={nombre} size={tamanio} color={color} />;
}
