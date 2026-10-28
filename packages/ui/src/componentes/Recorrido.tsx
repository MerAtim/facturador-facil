import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';
import { Texto } from './Texto';

export interface ParadaDelRecorrido {
  /** Lo que hay que tocar o completar, con el texto tal como aparece en el otro sitio. */
  readonly texto: string;
  /** Un dato para escribir o elegir en esa parada, por ejemplo el número de punto de venta. */
  readonly valor?: string;
}

/**
 * Ilustra el camino por las pantallas de otro sitio: cada parada es lo que hay que tocar, unida a la
 * siguiente por una línea. Sirve para guiar donde la app no puede llevar al usuario de la mano.
 */
export function Recorrido({ paradas }: { readonly paradas: readonly ParadaDelRecorrido[] }) {
  const { colores } = useTema();
  return (
    <View accessibilityRole="list">
      {paradas.map(({ texto, valor }, indice) => {
        const ultima = indice === paradas.length - 1;
        return (
          <View key={texto} style={estilos.parada} accessibilityRole="text">
            <View style={estilos.guia}>
              <Icon
                source={ultima ? 'cursor-default-click-outline' : 'circle-medium'}
                size={20}
                color={colores.primary}
              />
              {!ultima && <View style={[estilos.linea, { backgroundColor: colores.primary }]} />}
            </View>
            <View
              style={[
                estilos.boton,
                {
                  backgroundColor: colores.surfaceVariant,
                  marginBottom: ultima ? 0 : espacio.chico,
                },
              ]}
            >
              <Texto variante="etiqueta" style={{ color: colores.onSurfaceVariant }}>
                {texto}
              </Texto>
              {valor !== undefined && (
                <Texto variante="cuerpo" selectable style={{ color: colores.onSurface }}>
                  {valor}
                </Texto>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  parada: { flexDirection: 'row', gap: espacio.chico },
  guia: { alignItems: 'center', width: 20 },
  linea: { width: 2, flex: 1, opacity: 0.4 },
  boton: {
    flex: 1,
    borderRadius: radio.chico,
    paddingVertical: espacio.chico,
    paddingHorizontal: espacio.medio,
    gap: espacio.minimo,
  },
});
