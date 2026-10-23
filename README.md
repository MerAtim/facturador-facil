# Facturador Fácil

App móvil para emitir comprobantes electrónicos de ARCA de forma rápida y sin vueltas.

Nace de las limitaciones del facturador oficial: pantallas poco claras, demasiados pasos y cálculos que quedan a cargo del usuario. Por ejemplo, para una factura A hay que calcular a mano el neto sin IVA a partir del precio final. Acá ingresás el precio que cobrás y la app hace el resto.

## Principios

* **Seguridad primero.** La clave privada se genera en el teléfono, se guarda en el almacén seguro del sistema (Keystore en Android, Keychain en iOS) y nunca sale del dispositivo.
* **Local first.** No hay servidor intermedio: la app habla directo con los web services de ARCA.
* **Rápido de usar.** Una factura habitual tiene que salir en menos de 30 segundos.
* **Código mantenible.** Clean Architecture, SOLID, dominio aislado y testeado.

## Stack

* TypeScript en modo estricto
* React Native con Expo
* Monorepo con pnpm workspaces y Turborepo
* Vitest para tests unitarios, Maestro para pruebas de punta a punta
* SQLite cifrada para los datos locales

Los motivos de cada decisión están en [docs/adr](docs/adr).

## Primeros pasos

Requisitos:

* Node 22 (ver `.nvmrc`)
* [gitleaks](https://github.com/gitleaks/gitleaks), que revisa secretos antes de cada commit. En Windows: `winget install Gitleaks.Gitleaks`

```
corepack enable pnpm
pnpm install
pnpm typecheck
```

Si `corepack enable` falla por permisos en Windows, usá `corepack enable pnpm --install-directory "%APPDATA%\npm"`.

Por seguridad, pnpm solo instala versiones publicadas hace al menos 14 días (`minimumReleaseAge` en `pnpm-workspace.yaml`).

## Documentación

* [Arquitectura](docs/arquitectura.md)
* [Guía de contribución](CONTRIBUTING.md)
* [Política de seguridad](SECURITY.md)
* [Registro de decisiones](docs/adr)

## Estado

En etapa inicial. El trabajo está organizado en épicas e issues dentro del tablero del proyecto.
