import { StyleSheet } from 'react-native';
import { TextInput } from 'react-native-paper';

import { formatearEntradaDeImporte } from '../importes/entradaDeImporte';

/**
 * Campo para escribir un importe en pesos con formato argentino. Muestra el teclado numérico y
 * agrupa los miles mientras se escribe; `valor` es el texto tal como se ve, `1.234,5`.
 */
export function CampoDeImporte({
  etiqueta,
  valor,
  onCambiar,
  autoFocus = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly autoFocus?: boolean;
}) {
  return (
    <TextInput
      mode="outlined"
      label={etiqueta}
      value={valor}
      onChangeText={(texto) => {
        onCambiar(formatearEntradaDeImporte(texto));
      }}
      keyboardType="decimal-pad"
      placeholder="0,00"
      left={<TextInput.Affix text="$" />}
      autoFocus={autoFocus}
      contentStyle={estilos.cifras}
    />
  );
}

const estilos = StyleSheet.create({
  cifras: { fontVariant: ['tabular-nums'] },
});
