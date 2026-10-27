import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';

import { espacio } from '../tema/tokens';
import type { Opcion } from './SelectorSegmentado';

export interface Ficha<T extends string> extends Opcion<T> {
  /** Nombre de un ícono de Material Community Icons. */
  readonly icono?: string;
}

/**
 * Elección con un toque entre opciones que conviene tener a la vista, como los receptores
 * frecuentes. Si no entran en el ancho, se desplazan de costado.
 */
export function Fichas<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  readonly opciones: readonly Ficha<T>[];
  readonly valor: T;
  readonly onCambiar: (valor: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={estilos.fila}
      keyboardShouldPersistTaps="handled"
    >
      {opciones.map((opcion) => {
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
      })}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fila: { gap: espacio.chico },
});
