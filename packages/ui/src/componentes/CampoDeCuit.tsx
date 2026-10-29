import { View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import { formatearEntradaDeCuit } from '../cuit/entradaDeCuit';

/**
 * Campo para escribir un CUIT. Muestra el teclado numérico y pone los guiones solo. La validación
 * la decide quien lo usa: `error` explica qué está mal y `valido` marca el CUIT como correcto.
 */
export function CampoDeCuit({
  valor,
  onCambiar,
  error,
  valido = false,
  etiqueta = 'CUIT',
  autoFocus = false,
}: {
  readonly valor: string;
  readonly onCambiar: (valor: string) => void;
  readonly error?: string | undefined;
  readonly valido?: boolean;
  readonly etiqueta?: string;
  readonly autoFocus?: boolean;
}) {
  return (
    <View>
      <TextInput
        mode="outlined"
        label={etiqueta}
        value={valor}
        onChangeText={(texto) => {
          onCambiar(formatearEntradaDeCuit(texto));
        }}
        keyboardType="number-pad"
        // Un CUIT identifica a una persona: que el teclado no lo aprenda ni lo sugiera.
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        placeholder="20-12345678-6"
        maxLength={13}
        autoFocus={autoFocus}
        error={error !== undefined}
        // El tilde es solo visual: para el lector de pantalla sería un botón sin nombre.
        {...(valido
          ? {
              right: (
                <TextInput.Icon
                  icon="check-circle"
                  accessible={false}
                  importantForAccessibility="no"
                />
              ),
            }
          : {})}
      />
      {error !== undefined && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
    </View>
  );
}
