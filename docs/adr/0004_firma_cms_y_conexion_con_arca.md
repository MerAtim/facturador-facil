# 0004 Firma CMS y conexión con ARCA

**Estado:** aceptada

## Contexto

La ADR 0002 decidió que la clave privada vive en Keystore o Keychain y que la app habla directo con WSAA y WSFEv1. Faltaba confirmar que eso es viable desde React Native con Hermes, que no trae `crypto` de Node ni WebCrypto. El spike #21 lo validó en un emulador Android contra homologación.

Opciones evaluadas para la firma CMS:

* **node-forge:** arma CMS en JS puro, pero necesita la clave privada en memoria de JS, lo que contradice la ADR 0002. Además tiene un aviso de severidad alta sin parche (GHSA-86w9-cpqp-85rv) justamente en RSA PKCS#1.
* **pkijs con un motor WebCrypto nativo:** suma una capa nativa grande para usar una sola operación.
* **Firma delegada:** el almacén seguro solo firma bytes y todo el armado ASN.1 queda en JS.

## Decisión

* Se usa firma delegada. El módulo nativo `almacen-claves` (Kotlin y Swift) expone solo generar una clave RSA de 2048 bits, devolver la pública en SubjectPublicKeyInfo y firmar con SHA256withRSA. La clave privada no cruza nunca a JS.
* En Android la clave se genera en StrongBox cuando el equipo lo tiene, y si no en el TEE.
* `packages/arca` arma en JS el CSR PKCS#10 y el CMS SignedData con un codificador DER propio y mínimo. El SHA-256 del contenido viene de `@noble/hashes`, que está auditada y no tiene dependencias. No se escribe criptografía propia.
* El puerto `Firmador` separa a `packages/arca` del almacén: los tests usan un firmador con `node:crypto` y la app usa el de Keystore.
* Las llamadas HTTP pasan por el puerto `Transporte`. En la app es el `fetch` de la plataforma, que valida TLS contra el almacén del sistema. No se desactiva esa validación ni se fija el certificado del servidor: ARCA renueva el suyo seguido (el actual vence en enero de 2027) y un pin rompería la app en cada renovación.

## Resultados del spike

| Prueba | Resultado |
| --- | --- |
| TLS a `wsaahomo` y `wswhomo` | TLS 1.2, ECDHE, cadena Sectigo hasta USERTrust. Android la acepta sin configuración extra |
| FEDummy desde el emulador | AppServer, DbServer y AuthServer en OK, 955 ms |
| Clave en Keystore y CSR | 251 ms. openssl verifica el CSR y ARCA emitió el certificado a partir de él |
| CMS armado en JS | openssl lo verifica. WSAA lo interpreta (con un certificado autofirmado responde `cms.cert.untrusted`, no `cms.bad`) |
| Ticket de acceso de WSAA | Obtenido desde el emulador con la clave de Keystore, 1064 ms |

## Consecuencias

* El codificador DER cubre solo lo que piden el CSR y el CMS, con tests propios y lectura con control de límites. Si aparece otra estructura ASN.1 conviene evaluar `asn1js` antes de extenderlo.
* El certificado depende de la clave: si la clave se borra, el certificado emitido por ARCA deja de servir y hay que pedir otro. Durante el spike pasó una vez. Borrar o regenerar la clave tiene que pedir confirmación explícita (#33 y #35).
* Las respuestas SOAP se leen con `txml` (sin dependencias, mantenida, sin avisos de seguridad), importada desde `txml/txml` porque su entrada principal usa `node:stream`. Se descartaron `fast-xml-parser` y `@xmldom/xmldom` por la cantidad de avisos de 2026 en DTD y entidades, y `saxes` por estar sin mantenimiento. Todo documento con DTD se rechaza antes de parsear y solo se decodifican las entidades predefinidas, así que XXE y la expansión de entidades quedan descartados por construcción.
* En homologación WSAA entregó un ticket nuevo aunque había otro vigente para el mismo servicio. El código `coe.alreadyAuthenticated` se interpreta igual, pero no se pudo observar.
* `packages/arca` compila con los tipos de Node para tener `fetch`, `TextEncoder`, `btoa` y `atob`, que Hermes también provee. El código fuera de los tests no puede usar otras APIs de Node.
* **iOS queda sin validar.** El módulo Swift está escrito, pero no se compiló porque el equipo no tiene Mac. Hay que probarlo en un iPhone real o con EAS Build antes de cerrar #33. Allí la clave se guarda en el Keychain con `WhenUnlockedThisDeviceOnly`, porque Secure Enclave no admite RSA.
