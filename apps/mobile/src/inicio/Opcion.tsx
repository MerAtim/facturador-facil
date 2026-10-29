import { Icono, Tarjeta, Texto, useTema } from '@facturador/ui';
import { Pressable, StyleSheet, View } from 'react-native';

/** Una entrada de una lista de opciones: ícono, nombre y una línea que dice para qué sirve. */
export function Opcion({
  icono,
  titulo,
  descripcion,
  onPress,
}: {
  readonly icono: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly onPress: () => void;
}) {
  const { colores, espacio } = useTema();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${descripcion}`}
    >
      <Tarjeta>
        <View style={[estilos.fila, { gap: espacio.normal }]}>
          <Icono nombre={icono} color={colores.primary} tamanio={24} />
          <View style={estilos.textos}>
            <Texto variante="cuerpo">{titulo}</Texto>
            <Texto variante="detalle">{descripcion}</Texto>
          </View>
          <Icono nombre="chevron-right" color={colores.onSurfaceVariant} />
        </View>
      </Tarjeta>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center' },
  textos: { flex: 1 },
});
