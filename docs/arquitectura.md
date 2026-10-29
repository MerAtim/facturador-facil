# Arquitectura

## Estructura del monorepo

```
apps/
  mobile/          App Expo. Presentación e infraestructura específica del dispositivo
packages/
  dominio/         Entidades, value objects y reglas fiscales. TypeScript puro, sin dependencias externas
  aplicacion/      Casos de uso y puertos (interfaces)
  arca/            Adaptadores de WSAA, WSFEv1 y padrón. Implementan puertos de aplicacion
  ui/              Tema, tokens y componentes sobre Material 3 (ADR 0005). La app no usa Paper directo
  documentos/      HTML del comprobante y QR de ARCA para generar el PDF. Escapa todo dato insertado
  respaldo/        Formato cifrado del archivo de respaldo (ADR 0006). Implementa un puerto de aplicacion
  config/          Configuraciones compartidas de TypeScript, ESLint y Vitest
```

## Capas

```
presentacion (apps/mobile)
      │
      ▼
aplicacion  ◄──── infraestructura (arca, almacenamiento, criptografía)
      │
      ▼
   dominio
```

La regla de dependencia apunta siempre hacia adentro:

* `dominio` no conoce a nadie. No importa React, ni SOAP, ni SQLite.
* `aplicacion` define casos de uso (`EmitirComprobante`, `ConfigurarCertificado`) y los puertos que necesita (`AutorizadorDeComprobantes`, `AlmacenSeguro`, `RepositorioDeComprobantes`).
* `arca` y los adaptadores de `apps/mobile` implementan esos puertos.
* La composición de dependencias se hace en un único punto de entrada de la app.

## Reglas del dominio relevantes

* Los importes se representan en centavos enteros o con un tipo decimal exacto. Nunca con `number` flotante.
* El cálculo de neto a partir del precio final y el redondeo siguen las reglas de ARCA. Ver [ADR 0003](adr/0003_calculo_de_importes.md).
* Los value objects se validan al construirse: un `Cuit` inválido no puede existir.

## Flujo de emisión

1. El usuario carga receptor, ítems y precios.
2. El dominio arma el comprobante y calcula neto, IVA y total.
3. El caso de uso obtiene un ticket de acceso vigente (WSAA) firmando el TRA con la clave del dispositivo.
4. Consulta el último número autorizado y solicita el CAE (WSFEv1).
5. Guarda el comprobante autorizado y genera el PDF con el QR de ARCA.
