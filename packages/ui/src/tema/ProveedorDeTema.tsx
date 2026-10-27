import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  MD3DarkTheme,
  MD3LightTheme,
  PaperProvider,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';

import { coloresDe, esquemaDelSistema, type Esquema } from './esquema';
import { espacio, radio } from './tokens';

const temas: Readonly<Record<Esquema, MD3Theme>> = {
  claro: { ...MD3LightTheme, colors: coloresDe('claro') },
  oscuro: { ...MD3DarkTheme, colors: coloresDe('oscuro') },
};

/** Aplica el tema claro u oscuro según la preferencia del sistema, y lo cambia si el usuario la cambia. */
export function ProveedorDeTema({ children }: { readonly children: ReactNode }) {
  const esquema = esquemaDelSistema(useColorScheme());
  return <PaperProvider theme={temas[esquema]}>{children}</PaperProvider>;
}

/** Colores y medidas del tema vigente, para los estilos propios de cada pantalla. */
export function useTema() {
  const { colors, dark } = useTheme();
  return {
    colores: colors,
    esquema: dark ? ('oscuro' as const) : ('claro' as const),
    espacio,
    radio,
  };
}
