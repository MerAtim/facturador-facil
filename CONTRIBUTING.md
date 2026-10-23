# Guía de contribución

## Flujo de trabajo

Usamos GitHub Flow.

1. `main` siempre está estable y no recibe commits directos.
2. Cada issue se trabaja en una rama corta que sale de `main`.
3. Se abre un PR que referencia el issue con `Closes #12`. GitHub solo reconoce palabras clave en inglés para cerrar issues automáticamente.
4. El PR necesita CI en verde. Cuando el equipo tenga más de una persona, también una revisión aprobada.
5. Se integra con squash merge y se borra la rama.

### Nombres de ramas

`tipo/numero_descripcion_corta`

```
feat/14_calculo_neto_desde_final
fix/31_redondeo_iva_10_5
docs/7_modelo_de_amenazas
```

## Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) en español, en minúsculas, en modo imperativo y cortos. El cuerpo es opcional y se usa solo cuando suma contexto.

```
feat(dominio): agrega calculo de neto desde precio final
fix(arca): corrige firma del TRA
test(dominio): cubre alicuota 10,5
chore: actualiza dependencias
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `build`, `ci`, `chore`.

Los hooks de git validan el formato al commitear: commitlint revisa el mensaje y lint-staged corre ESLint y Prettier sobre los archivos modificados. También rechazan guiones en el mensaje.

Ámbitos permitidos: `dominio`, `aplicacion`, `arca`, `mobile`, `seguridad`, `ui`, `infra`, `deps`. El ámbito es opcional.

## Estilo de escritura

* Commits, PRs, issues y comentarios de código van en español.
* No usamos guiones como signo de puntuación en textos en español. Preferimos comas, dos puntos o una oración nueva.
* Los comentarios explican el porqué, no el qué. Si el código necesita un comentario para entenderse, primero intentamos mejorar el código.
* Los identificadores del dominio van en español (`Comprobante`, `AlicuotaIva`). Los términos técnicos genéricos pueden quedar en inglés.

## Tablero

| Columna | Significado |
|---|---|
| Backlog | Ideas y trabajo sin refinar |
| Listo | Refinado, con criterios de aceptación, se puede tomar |
| En curso | Alguien lo está trabajando (máximo 2 por persona) |
| En revisión | PR abierto |
| Hecho | Integrado en `main` |

Cada issue pertenece a una épica, tiene etiqueta de tipo, de área y de prioridad.

## Definición de hecho

* Criterios de aceptación cumplidos
* Tests que cubren el cambio
* Lint, tipos y tests en verde
* Sin secretos ni datos personales en el código ni en los logs
* Documentación actualizada si cambia el comportamiento
