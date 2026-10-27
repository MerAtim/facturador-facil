import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';
import { Texto } from './Texto';

export type TonoDeAviso = 'informacion' | 'error';

/**
 * Mensaje que tiene que verse sin interrumpir: el aviso de que se factura en homologación, o por qué
 * algo no se pudo hacer.
 */
export function Aviso({
  icono,
  tono = 'informacion',
  children,
}: {
  readonly icono: string;
  readonly tono?: TonoDeAviso;
  readonly children: ReactNode;
}) {
  const { colores } = useTema();
  const [fondo, texto] =
    tono === 'error'
      ? [colores.errorContainer, colores.onErrorContainer]
      : [colores.tertiaryContainer, colores.onTertiaryContainer];
  return (
    <View style={[estilos.aviso, { backgroundColor: fondo }]} accessible accessibilityRole="alert">
      <Icon source={icono} size={20} color={texto} />
      <Texto variante="detalle" style={[estilos.texto, { color: texto }]}>
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
