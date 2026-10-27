import { View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

/** Campo de texto libre con el estilo de los demás campos. */
export function CampoDeTexto({
  etiqueta,
  valor,
  onCambiar,
  maximo,
  autoFocus = false,
  numerico = false,
  error,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly maximo?: number;
  readonly autoFocus?: boolean;
  /** Muestra el teclado de números, por ejemplo para un punto de venta. */
  readonly numerico?: boolean;
  readonly error?: string | undefined;
}) {
  return (
    <View>
      <TextInput
        mode="outlined"
        label={etiqueta}
        value={valor}
        onChangeText={onCambiar}
        autoFocus={autoFocus}
        keyboardType={numerico ? 'number-pad' : 'default'}
        error={error !== undefined}
        {...(maximo === undefined ? {} : { maxLength: maximo })}
      />
      {error !== undefined && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
    </View>
  );
}
