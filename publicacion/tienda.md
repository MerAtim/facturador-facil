# Ficha de la tienda

Lo que se carga en Google Play Console y en App Store Connect. Las respuestas salen de lo que la app hace hoy: si cambia algo de lo que se declara acá, se actualiza esta ficha y la [política de privacidad](privacidad.md) en el mismo PR.

## Datos generales

| Campo | Valor |
| --- | --- |
| Nombre | Facturador Fácil |
| Categoría | Negocios (Play) · Negocios (App Store) |
| Contacto | [CORREO DE CONTACTO] |
| Política de privacidad | [URL PÚBLICA DE LA POLÍTICA] |
| Público | Mayores de 18 años |
| Anuncios | No |
| Compras dentro de la app | No |
| Países | Argentina |

## Textos

**Descripción breve** (Play, hasta 80 caracteres):

> Emití facturas electrónicas de ARCA desde el teléfono, sin servidores intermedios.

**Subtítulo** (App Store, hasta 30 caracteres):

> Facturas de ARCA en el celular

**Descripción completa:**

> Facturador Fácil te deja emitir facturas electrónicas de ARCA desde el teléfono, en pocos pasos y sin depender de una computadora.
>
> **Pensada para facturar rápido**
> • Facturas A, B y C, y notas de crédito, según tu condición frente al IVA.
> • Cargás el precio final y la app calcula el neto y el IVA.
> • Tus clientes y productos quedan guardados para la próxima factura.
> • Al cargar un cliente por su CUIT, la app completa sus datos desde el padrón de ARCA.
> • Compartís cada comprobante en PDF, con un mensaje listo, por WhatsApp o mail.
>
> **Tus datos, en tu teléfono**
> • La app habla directo con ARCA: no hay servidores intermedios que guarden tu información.
> • La clave de tu certificado se crea en el teléfono y nunca sale de él.
> • Tus datos y los de tus clientes quedan cifrados, y la app se abre con tu huella, tu rostro o tu PIN.
> • Podés crear un respaldo cifrado para pasar todo a otro teléfono.
>
> **Te guía en la puesta en marcha**
> La app te acompaña paso a paso para generar el certificado, autorizarlo en ARCA y verificar que todo funcione. Podés probar primero en el ambiente de homologación de ARCA, sin validez fiscal, y pasar a producción cuando quieras.
>
> Necesitás CUIT, clave fiscal y un punto de venta habilitado para factura electrónica por web service.

## Google Play: seguridad de los datos

**¿La app recopila o comparte datos de los usuarios?** Sí: envía a ARCA los datos de cada comprobante, que es un servicio externo. No hay servidores del proyecto.

| Tipo de datos | Recopilado | Compartido | Para qué | Opcional |
| --- | --- | --- | --- | --- |
| Información personal: nombre, dirección, otros identificadores (CUIT o DNI del emisor y de los clientes) | Sí | No | Funcionalidad de la app | No |
| Información financiera: otra información financiera (importes y datos de los comprobantes) | Sí | No | Funcionalidad de la app | No |

* **Compartido: No.** Google Play no cuenta como compartir lo que se envía a un tercero porque el usuario lo pide de forma explícita: cada comprobante se envía a ARCA cuando el usuario toca "Emitir".
* **Los datos se cifran en tránsito:** Sí, todo el tráfico va por HTTPS.
* **Se pueden borrar los datos:** Sí. Están solo en el teléfono: se borran desinstalando la app o borrando sus datos. No hay cuenta ni datos en servidores del proyecto.
* **Ubicación, contactos, fotos, audio, salud, navegación, identificadores del dispositivo:** No.

## App Store: privacidad de la app

| Tipo de datos | Uso | Vinculado a la identidad | Rastreo |
| --- | --- | --- | --- |
| Información de contacto: nombre, dirección física | Funcionalidad de la app | Sí | No |
| Información financiera: otra información financiera | Funcionalidad de la app | Sí | No |
| Otros datos: CUIT o DNI | Funcionalidad de la app | Sí | No |

La app no usa el marco de rastreo (App Tracking Transparency) porque no rastrea.

## Clasificación de contenido

Todas las respuestas del cuestionario son "No": no hay violencia, contenido sexual, lenguaje ofensivo, sustancias, apuestas, contenido generado por usuarios ni interacción entre usuarios. La clasificación esperada es "Apto para todo público" (Play) y 4+ (App Store), aunque la app está pensada para mayores de 18.

## Capturas

Se sacan con el build `punta_a_punta`, que arranca con un emisor y clientes de prueba: así ninguna captura muestra datos reales. Hace falta que ese build permita capturas de pantalla, porque la app las bloquea.

1. Inicio con los accesos frecuentes.
2. Nueva factura con un ítem y el resumen de neto, IVA y total.
3. Revisión antes de emitir.
4. Factura emitida con su CAE y el botón para compartir.
5. El PDF del comprobante.
6. La guía de puesta en marcha.

Tamaños: teléfono en vertical, 1080 × 1920 o más para Play; 6,9" y 6,5" para App Store.

## Antes de publicar

* [ ] Completar nombre del responsable, correo de contacto y fecha en la política
* [ ] Publicar la política en una URL pública
* [ ] Cuenta de Google Play Console y, para iOS, Apple Developer Program
* [ ] Prueba cerrada de Google Play: las cuentas personales nuevas necesitan 12 testers durante 14 días
* [ ] Capturas con el build de pruebas
