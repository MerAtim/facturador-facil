// Genera src/tema/colores.ts desde el color de marca, con el mismo algoritmo que Material Theme
// Builder, y agrega los campos propios de React Native Paper (elevación, deshabilitados y fondo
// de diálogos) como los calcula su generador de temas.
// Uso: node scripts/generarColores.mjs
import { writeFileSync } from 'node:fs';

import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';

const SEMILLA = '#00696B';

const tema = themeFromSourceColor(argbFromHex(SEMILLA));

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex, alfa) => `rgba(${rgb(hex).join(', ')}, ${String(alfa)})`;
const mezclar = (base, encima, proporcion) => {
  const [a, b] = [rgb(base), rgb(encima)];
  const canal = (i) => Math.round(a[i] * (1 - proporcion) + b[i] * proporcion);
  return `rgb(${[0, 1, 2].map(canal).join(', ')})`;
};

function colores(modo) {
  const esquema = Object.fromEntries(
    Object.entries(tema.schemes[modo].toJSON()).map(([clave, argb]) => [clave, hexFromArgb(argb)]),
  );
  const { surface, primary, onSurface } = esquema;
  return {
    ...esquema,
    elevation: {
      level0: 'transparent',
      level1: mezclar(surface, primary, 0.05),
      level2: mezclar(surface, primary, 0.08),
      level3: mezclar(surface, primary, 0.11),
      level4: mezclar(surface, primary, 0.12),
      level5: mezclar(surface, primary, 0.14),
    },
    surfaceDisabled: rgba(onSurface, 0.12),
    onSurfaceDisabled: rgba(onSurface, 0.38),
    backdrop: rgba(hexFromArgb(tema.palettes.neutralVariant.tone(20)), 0.4),
  };
}

const destino = new URL('../src/tema/colores.ts', import.meta.url);
writeFileSync(
  destino,
  `// Generado por scripts/generarColores.mjs desde la semilla ${SEMILLA}. No editar a mano.
import type { MD3Theme } from 'react-native-paper';

type Colores = MD3Theme['colors'];

export const SEMILLA = '${SEMILLA}';

export const coloresClaros: Colores = ${JSON.stringify(colores('light'), null, 2)};

export const coloresOscuros: Colores = ${JSON.stringify(colores('dark'), null, 2)};
`,
);
