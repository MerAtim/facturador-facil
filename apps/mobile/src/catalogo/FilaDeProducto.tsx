import type { Producto } from '@facturador/aplicacion';
import { Tarjeta, Texto } from '@facturador/ui';
import { Pressable } from 'react-native';

/** Un producto en una lista: su descripción, su precio y cómo se factura. */
export function FilaDeProducto({
  producto,
  conIva,
  onPress,
}: {
  readonly producto: Producto;
  readonly conIva: boolean;
  readonly onPress: () => void;
}) {
  const { descripcion, precio, modoDePrecio, alicuota, unidad } = producto;
  const detalle = [
    `${precio.formatear()}${conIva ? (modoDePrecio === 'final' ? ' con IVA' : ' sin IVA') : ''}`,
    ...(conIva && alicuota ? [`IVA\u00a0${alicuota.formatear()}`] : []),
    unidad.nombre,
  ].join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${descripcion}, ${detalle}`}
    >
      <Tarjeta>
        <Texto variante="cuerpo">{descripcion}</Texto>
        <Texto variante="detalle">{detalle}</Texto>
      </Tarjeta>
    </Pressable>
  );
}
