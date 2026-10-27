import { coloresClaros, coloresOscuros } from './colores';

export type Esquema = 'claro' | 'oscuro';

/**
 * El esquema que corresponde a la preferencia del sistema. Si el sistema no informa ninguna,
 * se usa el claro, que es el que se ve bien en más situaciones.
 */
export const esquemaDelSistema = (preferencia: string | null | undefined): Esquema =>
  preferencia === 'dark' ? 'oscuro' : 'claro';

export const coloresDe = (esquema: Esquema) =>
  esquema === 'oscuro' ? coloresOscuros : coloresClaros;
