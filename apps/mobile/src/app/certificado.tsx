import type { Ambiente } from '@facturador/aplicacion';
import {
  aliasDeClave,
  crearPedidoDeCertificado,
  nombreDelArchivoDePedido,
  type Titular,
} from '@facturador/arca';
import { Aviso, Boton, Pantalla, Texto, useTema } from '@facturador/ui';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { Redirect, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { almacenDeClavesDelDispositivo } from '../arca/almacenDeClavesDelDispositivo';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';

const DONDE_SUBIRLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'En ARCA, entrá con tu clave fiscal a "WSASS - Autogestión Certificados Homologación", creá un certificado nuevo y pegá o subí el pedido.',
  produccion:
    'En ARCA, entrá con tu clave fiscal a "Administración de Certificados Digitales", agregá un alias y subí el archivo del pedido.',
};

type Estado =
  | { readonly paso: 'sin_clave' }
  | { readonly paso: 'generando' }
  | { readonly paso: 'listo'; readonly pem: string }
  | { readonly paso: 'fallo' };

export default function Certificado() {
  const { espacio } = useTema();
  const configuracion = useConfiguracion();
  const [estado, setEstado] = useState<Estado>({ paso: 'sin_clave' });
  const [copiado, setCopiado] = useState(false);
  const [noSeCompartio, setNoSeCompartio] = useState(false);

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const titular: Titular | undefined = configurada && {
    ambiente: configurada.ambiente,
    cuit: configurada.emisor.datos.cuit,
    razonSocial: configurada.emisor.datos.razonSocial,
  };

  const pedir = async (datos: Titular) => {
    setEstado({ paso: 'generando' });
    try {
      setEstado({
        paso: 'listo',
        pem: await crearPedidoDeCertificado(datos, almacenDeClavesDelDispositivo),
      });
    } catch {
      setEstado({ paso: 'fallo' });
    }
  };

  // Si la clave ya existe, armar el pedido es instantáneo: se muestra directamente. Se vuelve a
  // armar solo si cambia el titular, que se identifica por el alias.
  const alias = titular && aliasDeClave(titular);
  useEffect(() => {
    if (titular && alias && almacenDeClavesDelDispositivo.existeClave(alias)) void pedir(titular);
  }, [alias]);

  if (configuracion.estado === 'lista' && !configurada) return <Redirect href="/configuracion" />;

  const compartir = async (pem: string, datos: Titular) => {
    setNoSeCompartio(false);
    try {
      // El pedido no es secreto: tiene la clave pública y los datos del contribuyente.
      const archivo = new File(Paths.cache, nombreDelArchivoDePedido(datos));
      if (archivo.exists) archivo.delete();
      archivo.write(pem);
      await Sharing.shareAsync(archivo.uri, {
        mimeType: 'application/pkcs10',
        dialogTitle: 'Pedido de certificado',
      });
    } catch {
      setNoSeCompartio(true);
    }
  };

  const copiar = async (pem: string) => {
    await Clipboard.setStringAsync(pem);
    setCopiado(true);
  };

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Certificado' }} />
      {titular && (
        <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
          <AvisoDeAmbiente ambiente={titular.ambiente} />
          <Texto variante="cuerpo">
            Para facturar, ARCA te da un certificado a partir de un pedido que genera la app. La
            clave del pedido se crea en este teléfono y nunca sale de él.
          </Texto>

          {estado.paso === 'sin_clave' && (
            <Boton icon="key-plus" onPress={() => void pedir(titular)}>
              Generar pedido de certificado
            </Boton>
          )}

          {estado.paso === 'generando' && (
            <Boton loading disabled>
              Generando la clave…
            </Boton>
          )}

          {estado.paso === 'fallo' && (
            <>
              <Aviso icono="alert-circle-outline">
                No se pudo generar el pedido. Verificá que el teléfono tenga bloqueo de pantalla y
                probá de nuevo.
              </Aviso>
              <Boton onPress={() => void pedir(titular)}>Reintentar</Boton>
            </>
          )}

          {estado.paso === 'listo' && (
            <View style={{ gap: espacio.medio }}>
              <Texto variante="subtitulo">Tu pedido está listo</Texto>
              <Texto variante="cuerpo">1. Mandalo a tu computadora o guardalo.</Texto>
              <Boton icon="share-variant" onPress={() => void compartir(estado.pem, titular)}>
                Compartir pedido
              </Boton>
              {noSeCompartio && (
                <Aviso icono="alert-circle-outline">
                  No se pudo compartir el pedido. Probá copiarlo como texto.
                </Aviso>
              )}
              <Boton
                variante="secundario"
                icon="content-copy"
                onPress={() => void copiar(estado.pem)}
              >
                {copiado ? 'Copiado' : 'Copiar como texto'}
              </Boton>
              <Texto variante="cuerpo">2. {DONDE_SUBIRLO[titular.ambiente]}</Texto>
              <Texto variante="cuerpo">
                3. Descargá el certificado que te da ARCA para cargarlo en la app.
              </Texto>
            </View>
          )}
        </ScrollView>
      )}
    </Pantalla>
  );
}
