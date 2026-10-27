# 0005 Design system sobre Material 3

**Estado:** aceptada

## Contexto

La app necesita una base visual coherente antes de las primeras pantallas: colores, tipografía, espaciado, modo oscuro y componentes que se repiten, como campos de importe y de CUIT. Hacerla a mano en cada pantalla lleva a inconsistencias. Hacerla desde cero cuesta meses de trabajo en accesibilidad y comportamiento.

## Decisión

* **Material Design 3 con React Native Paper.** Material es el lenguaje nativo de Android, donde está la mayoría de los usuarios. Paper es la implementación de Material 3 para React Native más madura, funciona en Android e iOS y no requiere código nativo.
* **Un tema propio generado desde un color de marca**, el verde azulado `#00696B`, con el mismo algoritmo que Material Theme Builder (`@material/material-color-utilities`). El script `packages/ui/scripts/generarColores.mjs` lo regenera: `pnpm --filter @facturador/ui colores`.
* **Tema claro y oscuro según la preferencia del sistema**, y cambia en vivo si el usuario la cambia.
* **La app no usa Paper directamente.** `@facturador/ui` expone el proveedor del tema, `useTema`, los tokens y los componentes propios. Una regla de ESLint en `apps/mobile` prohíbe importar `react-native-paper`. Así, cambiar de librería o ajustar un componente se hace en un solo lugar.
* **Tokens propios en español:**
  * espaciado en múltiplos de 4;
  * radios;
  * variantes de texto apoyadas en la escala de Material 3, para respetar el tamaño de letra del sistema.
* **Los importes usan cifras tabulares,** para que se alineen y no salten mientras se escriben.
* **Lo que el usuario espera de su plataforma queda nativo:** navegación, gestos, selectores de fecha y hoja de compartir. En iOS la app sigue las convenciones de iOS en esos puntos, aunque los componentes sean de Material.

## Consecuencias

* Un test verifica el contraste WCAG de cada par de colores de texto y fondo en los dos modos (4,5 a 1), y el del borde de los campos (3 a 1). Si se cambia la semilla, el test avisa si la nueva paleta no es accesible.
* Los íconos vienen de `@expo/vector-icons` (Material Community Icons), que Paper detecta solo.
* Los componentes propios (campo de importe, campo de CUIT, tarjeta de comprobante, resumen de totales) se construyen sobre Paper en `@facturador/ui` y no se usan componentes de Paper sueltos en las pantallas.
