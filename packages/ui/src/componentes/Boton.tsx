import type { ComponentProps } from 'react';
import { Button } from 'react-native-paper';

export type VarianteDeBoton = 'principal' | 'secundario' | 'texto';

const MODOS = {
  principal: 'contained',
  secundario: 'outlined',
  texto: 'text',
} as const satisfies Record<VarianteDeBoton, ComponentProps<typeof Button>['mode']>;

type PropiedadesDeBoton = Omit<ComponentProps<typeof Button>, 'mode'> & {
  readonly variante?: VarianteDeBoton;
};

/** Un solo botón principal por pantalla: la acción que el usuario vino a hacer. */
export function Boton({ variante = 'principal', ...resto }: PropiedadesDeBoton) {
  return <Button mode={MODOS[variante]} {...resto} />;
}
