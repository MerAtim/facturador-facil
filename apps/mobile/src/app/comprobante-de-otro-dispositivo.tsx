import { formatearConSigno, type EmitidoEnOtroDispositivo } from '@facturador/aplicacion';
import { Aviso, Pantalla, ResumenDeTotales, TarjetaDeComprobante, useTema } from '@facturador/ui';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { deOtrosDispositivos, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
import { claveDe } from '../emision/claveDelComprobante';
import { resumenDeOtroDispositivo } from '../emision/resumenDelComprobante';

type Estado =
  | { readonly paso: 'cargando' }
  | { readonly paso: 'listo'; readonly emitido: EmitidoEnOtroDispositivo }
  | { readonly paso: 'no_encontrado' };

/**
 * Un comprobante emitido desde otro dispositivo, con lo que ARCA tiene de él. ARCA no guarda los
 * ítems: el PDF lo comparte el dispositivo que lo emitió.
 */
export default function ComprobanteDeOtroDispositivo() {
  const { espacio } = useTema();
  const parametros = useLocalSearchParams();
  const configuracion = useConfiguracion();
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const clave = claveDe(parametros);
  const textoDeLaClave = clave
    ? `${String(clave.tipo.codigoArca)}.${String(clave.puntoDeVenta)}.${String(clave.numero)}`
    : '';

  useEffect(() => {
    if (configuracion.estado === 'cargando') return;
    if (!configurada || !clave) {
      setEstado({ paso: 'no_encontrado' });
      return;
    }
    let vigente = true;
    deOtrosDispositivos.leer(configurada.ambiente, configurada.emisor, clave).then(
      (emitido) => {
        if (vigente) setEstado(emitido ? { paso: 'listo', emitido } : { paso: 'no_encontrado' });
      },
      (error: unknown) => {
        registro.error('no se pudo leer el comprobante de otro dispositivo', error);
        if (vigente) setEstado({ paso: 'no_encontrado' });
      },
    );
    return () => {
      vigente = false;
    };
  }, [configuracion.estado, configurada, textoDeLaClave]);

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Comprobante' }} />
      {estado.paso === 'no_encontrado' && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se encontró el comprobante.
        </Aviso>
      )}
      {estado.paso === 'listo' && (
        <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
          <TarjetaDeComprobante
            {...resumenDeOtroDispositivo(estado.emitido)}
            autorizacion={{
              cae: estado.emitido.cae,
              vencimiento: estado.emitido.vencimientoDelCae.formatear(),
            }}
          />
          <ResumenDeTotales
            lineas={
              estado.emitido.tipo.discriminaIva()
                ? [
                    { etiqueta: 'Neto', importe: formatearConSigno(estado.emitido.netoEnCentavos) },
                    { etiqueta: 'IVA', importe: formatearConSigno(estado.emitido.ivaEnCentavos) },
                  ]
                : []
            }
            total={formatearConSigno(estado.emitido.totalEnCentavos)}
          />
          <Aviso icono="cellphone-link">
            Se emitió desde otro celular. ARCA no guarda el detalle de los ítems: para compartir el
            PDF, hacelo desde el celular que la emitió.
          </Aviso>
        </ScrollView>
      )}
    </Pantalla>
  );
}
