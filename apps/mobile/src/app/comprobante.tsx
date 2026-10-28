import type { ComprobanteEmitido } from '@facturador/aplicacion';
import { TipoComprobante } from '@facturador/dominio';
import {
  Aviso,
  Pantalla,
  ResumenDeTotales,
  Tarjeta,
  TarjetaDeComprobante,
  Texto,
  useTema,
} from '@facturador/ui';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { comprobantesEmitidos, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
import { CompartirComprobante } from '../emision/CompartirComprobante';
import { ItemsDelComprobante } from '../emision/ItemsDelComprobante';
import { lineasDelResumen } from '../emision/resumen';
import { resumenDelComprobante } from '../emision/resumenDelComprobante';

const ENTERO = /^\d{1,8}$/;

/** Los parámetros llegan como texto: se validan como cualquier entrada. */
function claveDe(parametros: Record<string, string | string[] | undefined>) {
  const { tipo, puntoDeVenta, numero } = parametros;
  if (typeof tipo !== 'string' || typeof puntoDeVenta !== 'string' || typeof numero !== 'string') {
    return undefined;
  }
  if (!ENTERO.test(tipo) || !ENTERO.test(puntoDeVenta) || !ENTERO.test(numero)) return undefined;
  const tipoDeComprobante = TipoComprobante.desdeCodigoArca(Number(tipo));
  return (
    tipoDeComprobante && {
      tipo: tipoDeComprobante,
      puntoDeVenta: Number(puntoDeVenta),
      numero: Number(numero),
    }
  );
}

type Estado =
  | { readonly paso: 'cargando' }
  | { readonly paso: 'listo'; readonly emitido: ComprobanteEmitido }
  | { readonly paso: 'no_encontrado' };

/** Un comprobante emitido, con todo su detalle, para volver a compartirlo. */
export default function DetalleDelComprobante() {
  const parametros = useLocalSearchParams();
  const configuracion = useConfiguracion();
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const clave = claveDe(parametros);
  const { tipo, puntoDeVenta, numero } = clave ?? {};

  useEffect(() => {
    if (!configurada) return;
    if (!tipo || puntoDeVenta === undefined || numero === undefined) {
      setEstado({ paso: 'no_encontrado' });
      return;
    }
    let vigente = true;
    comprobantesEmitidos
      .leer({
        ambiente: configurada.ambiente,
        emisor: configurada.emisor,
        tipo,
        puntoDeVenta,
        numero,
      })
      .then(
        (emitido) => {
          if (vigente) setEstado(emitido ? { paso: 'listo', emitido } : { paso: 'no_encontrado' });
        },
        (error: unknown) => {
          registro.error('no se pudo leer el comprobante', error);
          if (vigente) setEstado({ paso: 'no_encontrado' });
        },
      );
    return () => {
      vigente = false;
    };
  }, [configurada, tipo, puntoDeVenta, numero]);

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Comprobante' }} />
      {estado.paso === 'no_encontrado' && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se encontró el comprobante.
        </Aviso>
      )}
      {estado.paso === 'listo' && <Detalle emitido={estado.emitido} />}
    </Pantalla>
  );
}

function Detalle({ emitido }: { readonly emitido: ComprobanteEmitido }) {
  const { espacio } = useTema();
  const { comprobante, receptor, emisor, ambiente, puntoDeVenta, numero } = emitido;
  const { tipo, modoDePrecio } = comprobante.datos;
  const { autorizacion } = comprobante;

  return (
    <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
      <TarjetaDeComprobante
        {...resumenDelComprobante(emitido)}
        {...(autorizacion && {
          autorizacion: {
            cae: autorizacion.cae,
            vencimiento: autorizacion.vencimiento.formatear(),
          },
        })}
      />
      <Tarjeta>
        <Texto variante="etiqueta">
          {tipo.informaIva()
            ? `Ítems, precios ${modoDePrecio === 'final' ? 'con' : 'sin'} IVA`
            : 'Ítems'}
        </Texto>
        <ItemsDelComprobante comprobante={comprobante} />
      </Tarjeta>
      <ResumenDeTotales
        lineas={lineasDelResumen(tipo, comprobante.totales)}
        total={comprobante.totales.total.formatear()}
      />
      <CompartirComprobante
        documento={{
          comprobante,
          // Los datos del emisor de cuando se emitió: el PDF sale igual que la primera vez.
          emisor,
          receptor,
          puntoDeVenta,
          numero,
          deHomologacion: ambiente === 'homologacion',
        }}
      />
    </ScrollView>
  );
}
