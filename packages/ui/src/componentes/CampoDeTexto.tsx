import { TextInput } from 'react-native-paper';

/** Campo de texto libre con el estilo de los demás campos. */
export function CampoDeTexto({
  etiqueta,
  valor,
  onCambiar,
  maximo,
  autoFocus = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly maximo?: number;
  readonly autoFocus?: boolean;
}) {
  return (
    <TextInput
      mode="outlined"
      label={etiqueta}
      value={valor}
      onChangeText={onCambiar}
      autoFocus={autoFocus}
      {...(maximo === undefined ? {} : { maxLength: maximo })}
    />
  );
}
