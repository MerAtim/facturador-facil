import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import { formatearEntradaDeCantidad } from '../importes/entradaDeImporte';

/** Campo para una cantidad con decimales, como `2,5` horas. Vacío muestra un 1 de ejemplo. */
export function CampoDeCantidad({
  valor,
  onCambiar,
  error,
  etiqueta = 'Cantidad',
}: {
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly error?: string | undefined;
  readonly etiqueta?: string;
}) {
  return (
    <View>
      <TextInput
        mode="outlined"
        label={etiqueta}
        value={valor}
        onChangeText={(texto) => {
          onCambiar(formatearEntradaDeCantidad(texto));
        }}
        keyboardType="decimal-pad"
        placeholder="1"
        error={error !== undefined}
        contentStyle={estilos.cifras}
      />
      {error !== undefined && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  cifras: { fontVariant: ['tabular-nums'] },
});
