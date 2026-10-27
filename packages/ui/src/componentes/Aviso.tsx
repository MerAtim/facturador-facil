import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';
import { Texto } from './Texto';

/** Mensaje que tiene que verse sin interrumpir, como el aviso de que se factura en homologación. */
export function Aviso({
  icono,
  children,
}: {
  readonly icono: string;
  readonly children: ReactNode;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[estilos.aviso, { backgroundColor: colores.tertiaryContainer }]}
      accessible
      accessibilityRole="alert"
    >
      <Icon source={icono} size={20} color={colores.onTertiaryContainer} />
      <Texto variante="detalle" style={[estilos.texto, { color: colores.onTertiaryContainer }]}>
        {children}
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.medio,
    padding: espacio.medio,
    borderRadius: radio.medio,
  },
  texto: { flex: 1 },
});
