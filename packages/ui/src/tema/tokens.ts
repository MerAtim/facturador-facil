import type { MD3TypescaleKey } from 'react-native-paper';

/** Las escalas de la tipografía de Material 3: bodyLarge, titleMedium, etc. */
type EscalaTipografica = keyof typeof MD3TypescaleKey;

/** Escala de espaciado en múltiplos de 4, como la grilla de Material 3. */
export const espacio = {
  minimo: 4,
  chico: 8,
  medio: 12,
  normal: 16,
  grande: 24,
  enorme: 32,
} as const;

/** Radios de las esquinas, de los chips a las tarjetas y hojas. */
export const radio = {
  chico: 8,
  medio: 12,
  grande: 16,
  completo: 999,
} as const;

/**
 * Variantes de texto de la app. Cada una se apoya en la escala tipográfica de Material 3, así
 * que respetan el tamaño de letra que elija el usuario en el sistema.
 */
export type VarianteDeTexto =
  'titulo' | 'subtitulo' | 'cuerpo' | 'detalle' | 'etiqueta' | 'importe' | 'importeDestacado';

export interface EstiloDeTexto {
  readonly escala: EscalaTipografica;
  /** Los importes usan cifras de ancho fijo para que se alineen en columnas y no salten al cambiar. */
  readonly cifrasTabulares: boolean;
}

export const tipografia: Readonly<Record<VarianteDeTexto, EstiloDeTexto>> = {
  titulo: { escala: 'headlineSmall', cifrasTabulares: false },
  subtitulo: { escala: 'titleMedium', cifrasTabulares: false },
  cuerpo: { escala: 'bodyLarge', cifrasTabulares: false },
  detalle: { escala: 'bodyMedium', cifrasTabulares: false },
  etiqueta: { escala: 'labelLarge', cifrasTabulares: false },
  importe: { escala: 'bodyLarge', cifrasTabulares: true },
  importeDestacado: { escala: 'headlineMedium', cifrasTabulares: true },
};
