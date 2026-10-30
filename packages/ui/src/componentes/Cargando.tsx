import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTema } from '../tema/ProveedorDeTema';

/** Por debajo de este tiempo la carga no se nota: mostrar algo solo sería un parpadeo. */
const DEMORA_MS = 400;

/**
 * Indicador para una pantalla que todavía no tiene qué mostrar. Aparece recién si la carga tarda,
 * así una pantalla en blanco no parece una app colgada y una carga rápida no parpadea.
 */
export function Cargando() {
  const { colores } = useTema();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setVisible(true);
    }, DEMORA_MS);
    return () => {
      clearTimeout(temporizador);
    };
  }, []);

  if (!visible) return null;
  return (
    <View
      style={estilos.centro}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando"
    >
      <ActivityIndicator size="large" color={colores.primary} />
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
