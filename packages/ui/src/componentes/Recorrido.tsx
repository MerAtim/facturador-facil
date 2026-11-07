import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';
import { BotonDeIcono } from './BotonDeIcono';
import { Texto } from './Texto';

export interface ParadaDelRecorrido {
  /** Lo que hay que tocar o completar, con el texto tal como aparece en el otro sitio. */
  readonly texto: string;
  /** Un dato para escribir o elegir en esa parada, por ejemplo el número de punto de venta. */
  readonly valor?: string;
  /** El valor se escribe tal cual en el otro sitio, así que conviene ofrecer copiarlo. */
  readonly copiable?: boolean;
}

/**
 * Ilustra el camino por las pantallas de otro sitio: cada parada es lo que hay que tocar, unida a la
 * siguiente por una línea. Sirve para guiar donde la app no puede llevar al usuario de la mano.
 */
export function Recorrido({
  paradas,
  onCopiar,
}: {
  readonly paradas: readonly ParadaDelRecorrido[];
  /** Sin esta función, los valores copiables solo se pueden seleccionar. */
  readonly onCopiar?: (valor: string) => void;
}) {
  const { colores } = useTema();
  const [copiada, setCopiada] = useState<number>();
  return (
    <View accessibilityRole="list">
      {paradas.map(({ texto, valor, copiable = false }, indice) => {
        const ultima = indice === paradas.length - 1;
        const copiar = copiable && valor !== undefined && onCopiar;
        return (
          // Un mismo botón puede aparecer dos veces en el recorrido.
          <View key={`${String(indice)} ${texto}`} style={estilos.parada} accessibilityRole="text">
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
                <View style={estilos.valor}>
                  <Texto
                    variante="cuerpo"
                    selectable
                    style={[estilos.textoDelValor, { color: colores.onSurface }]}
                  >
                    {valor}
                  </Texto>
                  {copiar && (
                    // El botón conserva su área táctil, pero sin agrandar la parada.
                    <View style={estilos.copiar}>
                      <BotonDeIcono
                        icono={copiada === indice ? 'check' : 'content-copy'}
                        descripcion={copiada === indice ? `${valor} copiado` : `Copiar ${valor}`}
                        onPress={() => {
                          copiar(valor);
                          setCopiada(indice);
                        }}
                      />
                    </View>
                  )}
                </View>
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
  valor: { flexDirection: 'row', alignItems: 'center' },
  textoDelValor: { flex: 1 },
  copiar: { marginVertical: -espacio.normal, marginEnd: -espacio.chico },
});
