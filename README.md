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

* Node 24 LTS, versión exacta en `.nvmrc`
* [gitleaks](https://github.com/gitleaks/gitleaks), que revisa secretos antes de cada commit. En Windows: `winget install Gitleaks.Gitleaks`

```
corepack enable pnpm
pnpm install
pnpm typecheck
```

Si `corepack enable` falla por permisos en Windows, usá `corepack enable pnpm --install-directory "%APPDATA%\npm"`.

### App móvil en Android

La app usa un development build de Expo, no Expo Go, porque necesita módulos nativos de criptografía y almacenamiento seguro.

Requisitos adicionales:

* Android Studio con un emulador creado desde Device Manager. Recomendado: Pixel 8a con API 35.
* Java 17 (Microsoft OpenJDK 17: `winget install Microsoft.OpenJDK.17`). El Java que trae Android Studio es más nuevo y rompe la compilación del código nativo.
* Variables de entorno: `JAVA_HOME` apuntando a Java 17, `ANDROID_HOME` a `%LOCALAPPDATA%\Android\Sdk` y `%ANDROID_HOME%\platform-tools` en el `PATH`.
* En Windows, el repositorio en una ruta corta como `C:\dev\facturador-facil`. Las rutas que arma CMake superan el límite de 260 caracteres si el proyecto está en el Escritorio o en Documentos.

Con el emulador encendido:

```
pnpm --filter @facturador/mobile android
```

La primera vez compila todo y tarda varios minutos. Después, mientras no cambien dependencias nativas, alcanza con levantar Metro y la app se actualiza sola al guardar:

```
pnpm --filter @facturador/mobile start
```

### Builds instalables con EAS

Para probar en un teléfono sin cable ni Metro, la app se compila en los servidores de Expo con [EAS Build](https://docs.expo.dev/build/introduction/). Hace falta una cuenta de Expo con acceso al proyecto:

```
cd apps/mobile
npx eas-cli login
npx eas-cli build --profile prueba --platform android
```

Al terminar, EAS da un enlace y un QR para instalar el APK en cualquier Android. Los perfiles están en `apps/mobile/eas.json`:

| Perfil | Para qué | Resultado |
| --- | --- | --- |
| `desarrollo` | Desarrollar en un teléfono físico con Metro, como en el emulador | APK con el cliente de desarrollo |
| `prueba` | Probar la app tal como la va a usar alguien, en homologación | APK de distribución interna |
| `produccion` | Publicar en las tiendas | AAB firmado, con número de versión que sube solo |

* **Solo se compila lo commiteado.** `requireCommit` hace que EAS rechace un build con cambios sin commitear, así no viaja código local de prueba.
* **Los secretos viven en EAS, nunca en el repo.** El keystore de Android lo genera y guarda EAS la primera vez; las variables de entorno sensibles se cargan con `npx eas-cli env:create` en el ambiente que corresponda (`development`, `preview` o `production`). La app hoy no necesita ninguna: el certificado de ARCA se crea en el teléfono.
* **iOS** necesita una cuenta de Apple Developer y registrar cada iPhone de prueba con `npx eas-cli device:create`.

Por seguridad, pnpm solo instala versiones publicadas hace al menos 14 días (`minimumReleaseAge` en `pnpm-workspace.yaml`).

## Documentación

* [Arquitectura](docs/arquitectura.md)
* [Guía de contribución](CONTRIBUTING.md)
* [Política de seguridad](SECURITY.md)
* [Modelo de amenazas](docs/seguridad/modelo_de_amenazas.md)
* [Registro de decisiones](docs/adr)

## Estado

El trabajo está organizado en épicas e issues dentro del tablero del proyecto.
