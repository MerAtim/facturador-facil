import type { Ambiente } from '@facturador/aplicacion';
import {
  aliasDeClave,
  crearPedidoDeCertificado,
  nombreDelArchivoDePedido,
  TAMANIO_MAXIMO_DEL_CERTIFICADO,
  validarCertificado,
  type CertificadoGuardado,
  type MotivoCertificadoInvalido,
  type Titular,
} from '@facturador/arca';
import { FechaCalendario } from '@facturador/dominio';
import { Aviso, Boton, Pantalla, Tarjeta, Texto, useTema } from '@facturador/ui';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Redirect, Stack } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { almacenDeClavesDelDispositivo } from '../arca/almacenDeClavesDelDispositivo';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';
import { almacenDeCertificados, olvidarEmisiones, registro } from '../composicion';

const DONDE_SUBIRLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'En ARCA, entrá con tu clave fiscal a "WSASS - Autogestión Certificados Homologación", creá un certificado nuevo y pegá o subí el pedido.',
  produccion:
    'En ARCA, entrá con tu clave fiscal a "Administración de Certificados Digitales", agregá un alias y subí el archivo del pedido.',
};

const NOMBRE_DEL_AMBIENTE: Readonly<Record<Ambiente, string>> = {
  homologacion: 'homologación',
  produccion: 'producción',
};

function explicar(motivo: MotivoCertificadoInvalido, ambiente: Ambiente): string {
  switch (motivo) {
    case 'archivo_demasiado_grande':
      return 'El archivo es demasiado grande para ser un certificado.';
    case 'no_es_un_certificado':
      return 'El archivo no es un certificado. Elegí el que descargaste de ARCA.';
    case 'emisor_desconocido':
      return 'El certificado no lo emitió ARCA.';
    case 'es_de_otro_ambiente':
      return `El certificado no es de ${NOMBRE_DEL_AMBIENTE[ambiente]}. Cambiá el ambiente en los datos del emisor para cargarlo.`;
    case 'cuit_distinto':
      return 'El certificado es de otro CUIT.';
    case 'no_corresponde_a_la_clave':
      return 'El certificado no corresponde al pedido que generó este teléfono. Subí a ARCA el pedido de esta app y cargá el certificado que te dé.';
    case 'todavia_no_vigente':
      return 'El certificado todavía no está vigente. Revisá que la fecha del teléfono sea correcta.';
    case 'vencido':
      return 'El certificado está vencido. Pedí uno nuevo en ARCA con el pedido de esta app.';
  }
}

type Pedido =
  | { readonly paso: 'sin_clave' }
  | { readonly paso: 'generando' }
  | { readonly paso: 'listo'; readonly pem: string }
  | { readonly paso: 'fallo' };

export default function Certificado() {
  const { espacio } = useTema();
  const configuracion = useConfiguracion();
  const [pedido, setPedido] = useState<Pedido>({ paso: 'sin_clave' });
  const [copiado, setCopiado] = useState(false);
  const [noSeCompartio, setNoSeCompartio] = useState(false);
  const [certificado, setCertificado] = useState<CertificadoGuardado>();
  const [cargando, setCargando] = useState(false);
  const [rechazo, setRechazo] = useState<string>();

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const titular: Titular | undefined = configurada && {
    ambiente: configurada.ambiente,
    cuit: configurada.emisor.datos.cuit,
    razonSocial: configurada.emisor.datos.razonSocial,
  };

  const pedir = async (datos: Titular) => {
    setPedido({ paso: 'generando' });
    try {
      setPedido({
        paso: 'listo',
        pem: await crearPedidoDeCertificado(datos, almacenDeClavesDelDispositivo),
      });
    } catch (error) {
      registro.error('no se pudo generar el pedido de certificado', error);
      setPedido({ paso: 'fallo' });
    }
  };

  // Al cambiar el titular, que se identifica por el alias, se lee su certificado y, si la clave ya
  // existe, se arma el pedido, que es instantáneo.
  const alias = titular && aliasDeClave(titular);
  useEffect(() => {
    if (!titular || !alias) return;
    void almacenDeCertificados.leer(titular).then(setCertificado, () => undefined);
    if (almacenDeClavesDelDispositivo.existeClave(alias)) void pedir(titular);
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
    } catch (error) {
      registro.error('no se pudo compartir el pedido de certificado', error);
      setNoSeCompartio(true);
    }
  };

  const copiar = async (pem: string) => {
    await Clipboard.setStringAsync(pem);
    setCopiado(true);
  };

  const cargar = async (datos: Titular) => {
    setRechazo(undefined);
    // Sin copiarlo: el archivo se lee una vez, en memoria, desde donde el usuario lo tiene.
    const eleccion = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
    const [elegido] = eleccion.canceled ? [] : eleccion.assets;
    if (!elegido) return;

    setCargando(true);
    try {
      const archivo = new File(elegido.uri);
      // El tamaño se mira antes de leerlo, para no cargar en memoria un archivo enorme.
      if ((elegido.size ?? archivo.size) > TAMANIO_MAXIMO_DEL_CERTIFICADO) {
        setRechazo(explicar('archivo_demasiado_grande', datos.ambiente));
        return;
      }
      const resultado = await validarCertificado(
        await archivo.bytes(),
        datos,
        almacenDeClavesDelDispositivo,
        new Date(),
      );
      if (!resultado.ok) {
        setRechazo(explicar(resultado.error.motivo, datos.ambiente));
        return;
      }
      await almacenDeCertificados.guardar(datos, resultado.valor.der);
      olvidarEmisiones();
      setCertificado(resultado.valor);
    } catch (error) {
      registro.error('no se pudo leer el certificado elegido', error);
      setRechazo('No se pudo leer el archivo. Probá de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const botonDeCarga = (datos: Titular, texto: string) => (
    <Boton
      variante={certificado ? 'secundario' : 'principal'}
      icon="file-certificate-outline"
      onPress={() => void cargar(datos)}
      loading={cargando}
      disabled={cargando}
    >
      {texto}
    </Boton>
  );

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Certificado' }} />
      {titular && (
        <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
          <AvisoDeAmbiente ambiente={titular.ambiente} />

          {certificado ? (
            <Tarjeta>
              <Texto variante="subtitulo">Certificado cargado</Texto>
              <Texto variante="cuerpo">
                Vence el {FechaCalendario.enArgentina(certificado.vigenteHasta).formatear()}.
              </Texto>
              {botonDeCarga(titular, 'Cargar otro certificado')}
            </Tarjeta>
          ) : (
            <Texto variante="cuerpo">
              Para facturar, ARCA te da un certificado a partir de un pedido que genera la app. La
              clave del pedido se crea en este teléfono y nunca sale de él.
            </Texto>
          )}

          {rechazo !== undefined && (
            <Aviso icono="alert-circle-outline" tono="error">
              {rechazo}
            </Aviso>
          )}

          {!certificado && pedido.paso === 'sin_clave' && (
            <Boton icon="key-plus" onPress={() => void pedir(titular)}>
              Generar pedido de certificado
            </Boton>
          )}

          {!certificado && pedido.paso === 'generando' && (
            <Boton loading disabled>
              Generando la clave…
            </Boton>
          )}

          {!certificado && pedido.paso === 'fallo' && (
            <>
              <Aviso icono="alert-circle-outline" tono="error">
                No se pudo generar el pedido. Verificá que el teléfono tenga bloqueo de pantalla y
                probá de nuevo.
              </Aviso>
              <Boton onPress={() => void pedir(titular)}>Reintentar</Boton>
            </>
          )}

          {!certificado && pedido.paso === 'listo' && (
            <View style={{ gap: espacio.medio }}>
              <Texto variante="subtitulo">Tu pedido está listo</Texto>
              <Texto variante="cuerpo">1. Mandalo a tu computadora o guardalo.</Texto>
              <Boton
                variante="secundario"
                icon="share-variant"
                onPress={() => void compartir(pedido.pem, titular)}
              >
                Compartir pedido
              </Boton>
              {noSeCompartio && (
                <Aviso icono="alert-circle-outline" tono="error">
                  No se pudo compartir el pedido. Probá copiarlo como texto.
                </Aviso>
              )}
              <Boton variante="texto" icon="content-copy" onPress={() => void copiar(pedido.pem)}>
                {copiado ? 'Copiado' : 'Copiar como texto'}
              </Boton>
              <Texto variante="cuerpo">2. {DONDE_SUBIRLO[titular.ambiente]}</Texto>
              <Texto variante="cuerpo">
                3. Descargá el certificado que te da ARCA y cargalo acá.
              </Texto>
              {botonDeCarga(titular, 'Cargar certificado')}
            </View>
          )}
        </ScrollView>
      )}
    </Pantalla>
  );
}
