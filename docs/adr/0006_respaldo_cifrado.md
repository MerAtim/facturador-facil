# 0006 Respaldo cifrado

**Estado:** aceptada

## Contexto

La ADR 0002 deja todo en el teléfono: los comprobantes emitidos viven en la base cifrada y su clave no sale del dispositivo. Si el teléfono se pierde o se rompe, se pierde el registro de comprobantes, los clientes frecuentes y los datos del emisor. ARCA conserva los datos fiscales, pero no los PDF ni nada de lo que la app arma alrededor.

Hace falta un respaldo que el usuario pueda llevarse a otro teléfono sin depender de un servidor propio, y que no exponga datos personales de los clientes si el archivo cae en otras manos.

## Decisión

### Qué se respalda

* Los datos del emisor, los clientes frecuentes, todos los comprobantes del CUIT en los dos ambientes y el logo.
* Cada parte va en el mismo formato con que se guarda en el teléfono. Los comprobantes se reescriben en el formato actual, así un respaldo hecho desde datos viejos ya lleva el emisor de cada uno.
* No se respaldan la clave privada, que no sale nunca del Keystore o Keychain, ni el certificado, que sin ella no sirve. En el teléfono nuevo se genera otra clave y se pide otro certificado.

### El archivo

* Un único binario, sin zip ni ningún contenedor que se descomprima en carpetas: no hay rutas que interpretar, así que no hay zip slip.
* Encabezado de 52 bytes: `FFRESP`, versión, algoritmo de derivación, iteraciones, sal de 16 bytes y nonce de 24 bytes. Después, el contenido cifrado con su etiqueta.
* XChaCha20-Poly1305 de `@noble/ciphers`, auditada y sin dependencias, como `@noble/hashes` en la ADR 0004. El nonce de 24 bytes se puede generar al azar sin riesgo de repetirlo. El encabezado entero va como dato asociado: cambiar un parámetro invalida la etiqueta.
* La clave sale de la contraseña con PBKDF2-HMAC-SHA256 de 600.000 iteraciones, lo que recomienda OWASP. La contraseña se normaliza a NFC y se codifica en UTF-8, para que la misma contraseña escrita en otro teclado dé la misma clave.
* La derivación corre en código nativo, en el módulo `derivacion-de-clave`. En Android se implementa sobre `javax.crypto.Mac` y no con `PBEKeySpec`, que según la versión puede codificar distinto los caracteres que no son ASCII. En iOS usa `CCKeyDerivationPBKDF` de CommonCrypto.
* Las iteraciones van en el archivo: se pueden subir más adelante sin dejar de leer los respaldos viejos.

### Al importar

1. Antes de leer el archivo se mira su tamaño: más de 64 MB no se procesa.
2. Antes de derivar la clave, que es lo caro, se controla la firma del formato, la versión y que el costo pedido esté entre 100.000 y 10.000.000 iteraciones. Un archivo ajeno no puede colgar el teléfono ni pedir un costo que no proteja.
3. La etiqueta de Poly1305 prueba que nada cambió antes de interpretar el contenido. Una contraseña equivocada y un archivo modificado dan el mismo error: el cifrado no permite distinguirlos.
4. El contenido se valida como cualquier entrada: cada comprobante pasa por las mismas validaciones que lo guardado en el teléfono y tiene que ser del CUIT del respaldo. Lo que no pasa se descarta y se informa.
5. Restaurar solo suma: nada se borra ni se pisa. Si el teléfono ya factura con otro CUIT, el respaldo se rechaza.

## Alternativas descartadas

* **scrypt en JavaScript.** Es mejor que PBKDF2 contra ataques con GPU, pero con el costo que recomienda OWASP tardó 95 segundos en el emulador: Hermes no tiene JIT. Ninguna de las dos plataformas trae scrypt nativo.
* **Respaldo del sistema (Google o iCloud).** La base va cifrada con una clave que no viaja, así que el respaldo del sistema no sirve para cambiar de teléfono. Además, `allowBackup` está desactivado a propósito.
* **Servidor propio.** Contradice la ADR 0002 y suma un lugar donde se juntan los datos de todos los usuarios.

## Consecuencias

* Si el usuario olvida la contraseña, el respaldo no se puede abrir. La pantalla lo avisa antes de crearlo.
* El respaldo es tan fuerte como la contraseña: se pide un mínimo de 10 caracteres.
* Restaurar en un teléfono nuevo deja los datos listos, pero para facturar hay que repetir el certificado y la verificación con ARCA.
