import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';

/** Agrupa contenido relacionado, como cada ítem de un comprobante. Es la tarjeta con borde de M3. */
export function Tarjeta({ children }: { readonly children: ReactNode }) {
  const { colores } = useTema();
  return (
    <View
      style={[
        estilos.tarjeta,
        { borderColor: colores.outlineVariant, backgroundColor: colores.surface },
      ]}
    >
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    borderWidth: 1,
    borderRadius: radio.medio,
    padding: espacio.normal,
    gap: espacio.medio,
  },
});
