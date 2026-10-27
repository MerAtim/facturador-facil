import type { ComponentProps } from 'react';
import { Text } from 'react-native-paper';

import { tipografia, type VarianteDeTexto } from '../tema/tokens';

type PropiedadesDeTexto = Omit<ComponentProps<typeof Text>, 'variant'> & {
  readonly variante?: VarianteDeTexto;
};

export function Texto({ variante = 'cuerpo', style, ...resto }: PropiedadesDeTexto) {
  const { escala, cifrasTabulares } = tipografia[variante];
  return (
    <Text
      variant={escala}
      style={[cifrasTabulares && { fontVariant: ['tabular-nums'] }, style]}
      {...resto}
    />
  );
}
