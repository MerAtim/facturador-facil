# 0003 Cálculo de importes

**Estado:** propuesta

## Contexto

En la factura A hay que informar neto gravado e IVA por alícuota. La mayoría de los usuarios conoce el precio final que cobra, no el neto. El facturador oficial obliga a hacer la cuenta aparte.

## Decisión

* Los importes se modelan con un value object `Dinero` sobre enteros en centavos. No se usa `number` flotante para dinero.
* Cada ítem puede cargarse por precio final o por precio neto. El usuario elige y la app recuerda la preferencia.
* Desde precio final: `neto = redondear(final / (1 + alicuota), 2)` e `iva = final - neto`. Así el total coincide exactamente con lo que el usuario quiere cobrar.
* El IVA se agrupa por alícuota (0 %, 2,5 %, 5 %, 10,5 %, 21 %, 27 %) para armar el bloque `Iva` de WSFEv1.
* La diferencia entre `BaseImp × alicuota` e `Importe` queda acotada a un centavo por construcción: `Comprobante` solo obtiene el IVA de las funciones de cálculo, y un test lo verifica para miles de precios. No hace falta revalidarlo antes de enviar.

## Consecuencias

* El cálculo vive solo en `packages/dominio` y se cubre con tests de tabla, incluyendo casos borde de redondeo.
* Un test recorre miles de precios por cada alícuota y verifica que el IVA calculado por diferencia nunca se aparta más de un centavo de `neto × alicuota`.
* Hay que confirmar en homologación que ARCA acepta esa diferencia de un centavo antes de pasar a aceptada.
