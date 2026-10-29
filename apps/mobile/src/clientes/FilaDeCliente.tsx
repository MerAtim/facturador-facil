import type { Cliente } from '@facturador/aplicacion';
import { Tarjeta, Texto } from '@facturador/ui';
import { Pressable } from 'react-native';

/** Un cliente en una lista: su nombre, si lo tiene, su CUIT y su condición frente al IVA. */
export function FilaDeCliente({
  cliente,
  onPress,
}: {
  readonly cliente: Cliente;
  readonly onPress: () => void;
}) {
  const { cuit, condicion, nombre } = cliente;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${nombre ?? `CUIT ${cuit.formateado()}`}, ${condicion.descripcion}`}
    >
      <Tarjeta>
        <Texto variante="cuerpo">{nombre ?? `CUIT ${cuit.formateado()}`}</Texto>
        <Texto variante="detalle">
          {nombre ? `CUIT ${cuit.formateado()} · ` : ''}
          {condicion.descripcion}
        </Texto>
      </Tarjeta>
    </Pressable>
  );
}
