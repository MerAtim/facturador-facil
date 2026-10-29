# Publicación

## Versión mínima

La app lee [version-minima.json](version-minima.json) desde la rama `main` antes de emitir. Una versión instalada por debajo de `versionMinima` no emite comprobantes y le pide al usuario que actualice; ver comprobantes, compartirlos y hacer respaldos sigue andando.

Cuando una versión publicada tiene una falla grave:

1. Publicar en las tiendas la versión que la corrige.
2. Esperar a que esté disponible para todos.
3. Subir `versionMinima` a esa versión con un PR.

El cambio llega a las apps en minutos. Sin conexión, cada app aplica el último mínimo que conoció. Bajar el mínimo deshace el bloqueo.
