export type Resultado<T, E> =
  { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly error: E };

export const exito = <T>(valor: T): Resultado<T, never> => ({ ok: true, valor });

export const fallo = <E>(error: E): Resultado<never, E> => ({ ok: false, error });
