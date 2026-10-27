import type { CondicionEmisor } from '@facturador/dominio';

/**
 * Condición del emisor hasta que exista la configuración del emisor (#57). Responsable inscripto
 * ejercita todas las clases: A y B según el receptor.
 */
export const CONDICION_DEL_EMISOR: CondicionEmisor = 'responsable_inscripto';
