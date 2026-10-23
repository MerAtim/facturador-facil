# 0001 Stack tecnológico

**Estado:** aceptada

## Contexto

Queremos una app móvil para Android e iOS, mantenible por un equipo chico que puede crecer. El dominio fiscal tiene reglas que conviene modelar con tipos fuertes.

## Decisión

* TypeScript estricto en todo el proyecto.
* React Native con Expo (development builds) para tener una sola base de código y acceso a módulos nativos cuando haga falta.
* Monorepo con pnpm workspaces y Turborepo, separando dominio, aplicación e infraestructura en paquetes.
* Vitest para unitarios, Maestro para flujos de punta a punta.
* ESLint, Prettier, commitlint y CI en GitHub Actions.

## Consecuencias

* Un solo lenguaje facilita sumar colaboradores y compartir el dominio si más adelante hay una versión web.
* La firma CMS y el cliente SOAP de ARCA se resuelven en JavaScript o con un módulo nativo. Esto se valida en un spike antes de comprometer el diseño.
* Expo nos obliga a usar development builds por los módulos nativos de criptografía y base cifrada.
