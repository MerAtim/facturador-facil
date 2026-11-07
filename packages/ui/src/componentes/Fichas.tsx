import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { espacio } from '../tema/tokens';
import type { Opcion } from './SelectorSegmentado';

export interface Ficha<T extends string> extends Opcion<T> {
  /** Nombre de un ícono de Material Community Icons. */
  readonly icono?: string;
}

/**
 * Elección con un toque entre opciones que conviene tener a la vista, como los receptores
 * frecuentes. Si no entran en el ancho, se desplazan de costado; las que no pueden quedar
 * escondidas, como las acciones, van con `desplazable={false}` y bajan de renglón.
 */
export function Fichas<T extends string>({
  opciones,
  valor,
  onCambiar,
  desplazable = true,
}: {
  readonly opciones: readonly Ficha<T>[];
  /** Sin ninguna elegida, un valor que no está entre las opciones. */
  readonly valor: T | '';
  readonly onCambiar: (valor: T) => void;
  readonly desplazable?: boolean;
}) {
  const contenedor = (fichas: ReactNode) =>
    desplazable ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={estilos.fila}
        keyboardShouldPersistTaps="handled"
      >
        {fichas}
      </ScrollView>
    ) : (
      <View style={[estilos.fila, estilos.envuelta]}>{fichas}</View>
    );
  return contenedor(
    opciones.map((opcion) => {
      const elegida = opcion.valor === valor;
      const icono = elegida ? 'check' : opcion.icono;
      // Como las fichas de filtro de Material 3: con borde, y rellena con un tilde la elegida.
      return (
        <Chip
          key={opcion.valor}
          mode={elegida ? 'flat' : 'outlined'}
          selected={elegida}
          showSelectedCheck={false}
          {...(icono ? { icon: icono } : {})}
          onPress={() => {
            onCambiar(opcion.valor);
          }}
          accessibilityState={{ selected: elegida }}
        >
          {opcion.etiqueta}
        </Chip>
      );
    }),
  );
}

const estilos = StyleSheet.create({
  fila: { gap: espacio.chico },
  envuelta: { flexDirection: 'row', flexWrap: 'wrap' },
});
