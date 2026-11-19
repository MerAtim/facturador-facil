import { Icono, Texto, useTema } from '@facturador/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/** Una idea de una explicación: un ícono que la anticipa, un título corto y el detalle. */
export function Punto({
  icono,
  titulo,
  children,
}: {
  readonly icono: string;
  readonly titulo?: string;
  readonly children: ReactNode;
}) {
  const { colores, espacio } = useTema();
  return (
    <View style={[estilos.punto, { gap: espacio.medio }]} accessible>
      <Icono nombre={icono} color={colores.primary} />
      <View style={estilos.texto}>
        {titulo !== undefined && <Texto variante="etiqueta">{titulo}</Texto>}
        <Texto variante="cuerpo">{children}</Texto>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  punto: { flexDirection: 'row', alignItems: 'flex-start' },
  texto: { flex: 1 },
});
