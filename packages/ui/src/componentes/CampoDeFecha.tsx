import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { HelperText, TextInput, TouchableRipple } from 'react-native-paper';

/**
 * Campo de fecha con el selector nativo de cada plataforma: el diálogo de calendario en Android y
 * el calendario integrado en iOS. `texto` es la fecha ya formateada para mostrar.
 */
export function CampoDeFecha({
  etiqueta,
  texto,
  valor,
  onCambiar,
  maxima,
  error,
}: {
  readonly etiqueta: string;
  readonly texto: string;
  /** La fecha que muestra el calendario al abrirse. */
  readonly valor: Date;
  readonly onCambiar: (fecha: Date) => void;
  readonly maxima?: Date;
  readonly error?: string | undefined;
}) {
  const [abiertoEnIos, setAbiertoEnIos] = useState(false);
  const limite = maxima ? { maximumDate: maxima } : {};

  const abrir = () => {
    if (Platform.OS !== 'android') {
      setAbiertoEnIos((abierto) => !abierto);
      return;
    }
    DateTimePickerAndroid.open({
      value: valor,
      mode: 'date',
      ...limite,
      onValueChange: (_, fecha) => {
        onCambiar(fecha);
      },
    });
  };

  return (
    <View>
      <TouchableRipple
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: ${texto}`}
      >
        {/* Se ve como los demás campos, pero el toque lo recibe el contenedor. */}
        <View pointerEvents="none">
          <TextInput
            mode="outlined"
            label={etiqueta}
            value={texto}
            editable={false}
            error={error !== undefined}
            right={<TextInput.Icon icon="calendar" />}
          />
        </View>
      </TouchableRipple>
      {error !== undefined && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
      {abiertoEnIos && (
        <DateTimePicker
          value={valor}
          mode="date"
          display="inline"
          {...limite}
          onValueChange={(_, fecha) => {
            onCambiar(fecha);
          }}
        />
      )}
    </View>
  );
}
