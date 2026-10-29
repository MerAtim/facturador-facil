import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, SegmentedButtons, Text } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio } from '../tema/tokens';

export interface Opcion<T extends string> {
  readonly valor: T;
  readonly etiqueta: string;
}

/** Desde esta escala de fuente del teléfono, las opciones no entran una al lado de la otra. */
const ESCALA_PARA_APILAR = 1.3;
const ALTO_MINIMO = 48;

/**
 * Elección entre dos o tres opciones que se ven todas a la vez, como precio final o neto. Con la
 * fuente grande se apilan: lado a lado, Paper cortaba "Homologación" en "Homologaci…".
 */
export function SelectorSegmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  readonly opciones: readonly Opcion<T>[];
  readonly valor: T;
  readonly onCambiar: (valor: T) => void;
}) {
  const { colores } = useTema();
  const apilar = useWindowDimensions().fontScale > ESCALA_PARA_APILAR;

  if (!apilar) {
    return (
      <SegmentedButtons
        value={valor}
        onValueChange={(elegido) => {
          const opcion = opciones.find((o) => o.valor === elegido);
          if (opcion) onCambiar(opcion.valor);
        }}
        buttons={opciones.map(({ valor: v, etiqueta }) => ({ value: v, label: etiqueta }))}
      />
    );
  }

  return (
    <View accessibilityRole="radiogroup" style={[estilos.grupo, { borderColor: colores.outline }]}>
      {opciones.map((opcion, indice) => {
        const elegida = opcion.valor === valor;
        return (
          <Pressable
            key={opcion.valor}
            onPress={() => {
              onCambiar(opcion.valor);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: elegida }}
            android_ripple={{ color: colores.primary }}
            style={[
              estilos.opcion,
              indice > 0 && { borderTopWidth: 1, borderTopColor: colores.outline },
              elegida && { backgroundColor: colores.secondaryContainer },
            ]}
          >
            {elegida && <Icon source="check" size={18} color={colores.onSecondaryContainer} />}
            <Text
              variant="labelLarge"
              style={[
                estilos.etiqueta,
                { color: elegida ? colores.onSecondaryContainer : colores.onSurface },
              ]}
            >
              {opcion.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { borderWidth: 1, borderRadius: ALTO_MINIMO / 2, overflow: 'hidden' },
  opcion: {
    minHeight: ALTO_MINIMO,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.chico,
    paddingHorizontal: espacio.grande,
    paddingVertical: espacio.chico,
  },
  etiqueta: { flexShrink: 1, textAlign: 'center' },
});
