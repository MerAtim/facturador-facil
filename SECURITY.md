# Política de seguridad

## Reporte de vulnerabilidades

No abras issues públicos para problemas de seguridad. Usá la opción **Report a vulnerability** de la pestaña Security del repositorio. Respondemos dentro de las 72 horas.

## Lineamientos

* La clave privada del certificado de ARCA se genera en el dispositivo y se guarda en Keystore o Keychain. No se exporta, no se registra en logs y no se envía a ningún servidor propio.
* El ticket de acceso de WSAA se guarda en el almacén seguro y se descarta al vencer.
* La base local se cifra. La clave de cifrado vive en el almacén seguro.
* El acceso a la app se protege con biometría o PIN.
* Todas las entradas se validan en el borde con esquemas tipados.
* Los logs nunca incluyen CUIT completos, certificados, tokens ni importes asociados a personas.
* Las dependencias se auditan en cada PR y se actualizan con Dependabot.
* Tomamos como referencia OWASP MASVS para aplicaciones móviles. El [modelo de amenazas](docs/seguridad/modelo_de_amenazas.md) detalla qué se protege, cómo, y el estado de cada control.
