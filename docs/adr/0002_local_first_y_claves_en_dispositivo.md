# 0002 Local first y claves en el dispositivo

**Estado:** aceptada

## Contexto

Para facturar en ARCA se necesita un certificado asociado al CUIT y su clave privada. Quien tenga esa clave puede emitir comprobantes en nombre del contribuyente. Guardar claves de terceros en un servidor convierte al servidor en un objetivo muy valioso.

## Decisión

* La app genera el par de claves en el teléfono y exporta solo el CSR para que el usuario lo cargue en ARCA.
* La clave privada se guarda en Keystore o Keychain, con acceso condicionado a desbloqueo del dispositivo.
* La app consume WSAA y WSFEv1 directamente, sin servidor intermedio.
* Los datos (clientes, productos, comprobantes) viven en una base SQLite cifrada en el dispositivo.

## Consecuencias

* No hay base de datos central con secretos que proteger.
* Si el usuario pierde el teléfono, genera un nuevo certificado en ARCA. Hay que diseñar un respaldo cifrado opcional de los datos, nunca de la clave.
* El uso desde varios dispositivos o la sincronización quedan fuera del MVP y requerirán una decisión nueva.
