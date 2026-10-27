import type { MotivoCuitInvalido } from '@facturador/dominio';

export const MENSAJE_DE_CUIT: Readonly<Record<MotivoCuitInvalido, string>> = {
  caracteres_invalidos: 'El CUIT solo lleva números.',
  longitud_invalida: 'El CUIT tiene 11 dígitos.',
  prefijo_invalido: 'Un CUIT empieza con 20, 23, 24, 25, 26, 27, 30, 33 o 34.',
  digito_verificador_invalido: 'El último dígito no coincide. Revisá que esté bien escrito.',
};
