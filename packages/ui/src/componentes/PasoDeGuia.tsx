import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useTema } from '../tema/ProveedorDeTema';
import { espacio, radio } from '../tema/tokens';
import { Texto } from './Texto';

const DIAMETRO = 28;

/**
 * Un paso de una guía: número o tilde, título y, si está abierto, su contenido. El paso en curso
 * se resalta con el borde para que se vea dónde retomar.
 */
export function PasoDeGuia({
  numero,
  titulo,
  resumen,
  hecho,
  actual,
  abierto,
  onAlternar,
  children,
}: {
  readonly numero: number;
  readonly titulo: string;
  /** Una línea que se ve aunque el paso esté cerrado. */
  readonly resumen: string;
  readonly hecho: boolean;
  readonly actual: boolean;
  readonly abierto: boolean;
  readonly onAlternar: () => void;
  readonly children?: ReactNode;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        estilos.tarjeta,
        {
          borderColor: actual ? colores.primary : colores.outlineVariant,
          borderWidth: actual ? 2 : 1,
          backgroundColor: colores.surface,
        },
      ]}
    >
      <Pressable
        onPress={onAlternar}
        style={estilos.encabezado}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel={`Paso ${String(numero)}: ${titulo}. ${hecho ? 'Hecho' : 'Pendiente'}.`}
      >
        <View
          style={[
            estilos.marca,
            hecho
              ? { backgroundColor: colores.primary }
              : { borderColor: colores.outline, borderWidth: 1 },
          ]}
        >
          {hecho ? (
            <Icon source="check" size={18} color={colores.onPrimary} />
          ) : (
            <Texto variante="etiqueta">{numero}</Texto>
          )}
        </View>
        <View style={estilos.textos}>
          <Texto variante="subtitulo">{titulo}</Texto>
          <Texto variante="detalle" style={{ color: colores.onSurfaceVariant }}>
            {resumen}
          </Texto>
        </View>
        <Icon
          source={abierto ? 'chevron-up' : 'chevron-down'}
          size={24}
          color={colores.onSurfaceVariant}
        />
      </Pressable>
      {abierto && <View style={estilos.contenido}>{children}</View>}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: { borderRadius: radio.medio, padding: espacio.normal, gap: espacio.medio },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: espacio.medio },
  marca: {
    width: DIAMETRO,
    height: DIAMETRO,
    borderRadius: DIAMETRO / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1, gap: espacio.minimo },
  contenido: { gap: espacio.medio },
});
