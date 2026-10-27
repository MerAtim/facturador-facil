import { TextInput } from 'react-native-paper';

/** Campo de texto libre con el estilo de los demás campos. */
export function CampoDeTexto({
  etiqueta,
  valor,
  onCambiar,
  maximo,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly maximo?: number;
}) {
  return (
    <TextInput
      mode="outlined"
      label={etiqueta}
      value={valor}
      onChangeText={onCambiar}
      {...(maximo === undefined ? {} : { maxLength: maximo })}
    />
  );
}
