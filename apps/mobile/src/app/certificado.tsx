import { avisoDeVencimiento, type Ambiente } from '@facturador/aplicacion';
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

import { AvisoDeVencimiento } from '../alta/AvisoDeVencimiento';
import { almacenDeClavesDelDispositivo } from '../arca/almacenDeClavesDelDispositivo';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';
import { almacenDeCertificados, olvidarEmisiones, registro, registroDeAlta } from '../composicion';

const DONDE_SUBIRLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'En ARCA, entrá con tu clave fiscal a "WSASS - Autogestión Certificados Homologación", creá un certificado nuevo y pegá o subí el pedido.',
  produccion:
    'En ARCA, entrá con tu clave fiscal a "Administración de Certificados Digitales", agregá un alias y subí el archivo del pedido.',
};

/** Renovar es pedir otro certificado con la misma clave, para el mismo alias de ARCA. */
const DONDE_RENOVARLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'En ARCA, entrá con tu clave fiscal a "WSASS - Autogestión Certificados Homologación", creá un certificado nuevo y pegá o subí el pedido.',
  produccion:
    'En ARCA, entrá con tu clave fiscal a "Administración de Certificados Digitales", elegí el alias que ya usás con la app, tocá "Agregar certificado" y subí el pedido. Con el mismo alias no hace falta volver a autorizar la factura electrónica.',
};

const COMO_CARGARLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'WSASS te muestra el certificado como texto: copialo entero, desde BEGIN CERTIFICATE hasta END CERTIFICATE, y pegalo acá. Si lo guardaste como archivo, cargalo.',
  produccion: 'Descargá el certificado que te da ARCA y cargalo acá.',
};

/** El certificado llega como archivo o como el texto que muestra WSASS. */
type Origen = 'archivo' | 'texto';

const NOMBRE_DEL_AMBIENTE: Readonly<Record<Ambiente, string>> = {
  homologacion: 'homologación',
  produccion: 'producción',
};

function explicar(motivo: MotivoCertificadoInvalido, ambiente: Ambiente, origen: Origen): string {
  switch (motivo) {
    case 'archivo_demasiado_grande':
      return origen === 'archivo'
        ? 'El archivo es demasiado grande para ser un certificado.'
        : 'Lo que copiaste es demasiado largo para ser un certificado.';
    case 'no_es_un_certificado':
      return origen === 'archivo'
        ? 'El archivo no es un certificado. Elegí el que descargaste de ARCA.'
        : 'Lo que copiaste no es un certificado. Copiá el texto de ARCA entero, desde BEGIN CERTIFICATE hasta END CERTIFICATE.';
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

  // Cerca del vencimiento, o ya vencido, se muestran los pasos para renovarlo.
  const renovar =
    certificado !== undefined &&
    avisoDeVencimiento(certificado.vigenteHasta, new Date()).tipo !== 'vigente';
  const mostrarPedido = !certificado || renovar;

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

  /** Valida lo recibido como cualquier entrada y, si es el certificado de este teléfono, lo guarda. */
  const aceptar = async (contenido: Uint8Array, datos: Titular, origen: Origen) => {
    const resultado = await validarCertificado(
      contenido,
      datos,
      almacenDeClavesDelDispositivo,
      new Date(),
    );
    if (!resultado.ok) {
      setRechazo(explicar(resultado.error.motivo, datos.ambiente, origen));
      return;
    }
    await almacenDeCertificados.guardar(datos, resultado.valor.der);
    olvidarEmisiones();
    // Lo verificado con el certificado anterior no prueba nada del nuevo.
    await registroDeAlta.olvidarVerificacion(datos);
    setCertificado(resultado.valor);
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
        setRechazo(explicar('archivo_demasiado_grande', datos.ambiente, 'archivo'));
        return;
      }
      await aceptar(await archivo.bytes(), datos, 'archivo');
    } catch (error) {
      registro.error('no se pudo leer el certificado elegido', error);
      setRechazo('No se pudo leer el archivo. Probá de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  const pegar = async (datos: Titular) => {
    setRechazo(undefined);
    setCargando(true);
    try {
      const texto = await Clipboard.getStringAsync();
      if (texto.trim() === '') {
        setRechazo(
          'No hay nada copiado. Copiá el certificado que te muestra ARCA y volvé a pegar.',
        );
        return;
      }
      if (texto.length > TAMANIO_MAXIMO_DEL_CERTIFICADO) {
        setRechazo(explicar('archivo_demasiado_grande', datos.ambiente, 'texto'));
        return;
      }
      await aceptar(new TextEncoder().encode(texto), datos, 'texto');
    } catch (error) {
      registro.error('no se pudo leer el certificado pegado', error);
      setRechazo('No se pudo leer lo que copiaste. Probá de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  /** Homologación muestra el certificado como texto; producción lo descarga como archivo. */
  const botonesDeCarga = (datos: Titular) => {
    const principal = certificado ? 'secundario' : 'principal';
    const pegarPrimero = datos.ambiente === 'homologacion';
    const botones = [
      <Boton
        key="pegar"
        variante={pegarPrimero ? principal : 'secundario'}
        icon="content-paste"
        onPress={() => void pegar(datos)}
        loading={cargando && pegarPrimero}
        disabled={cargando}
      >
        {certificado ? 'Pegar otro certificado' : 'Pegar certificado'}
      </Boton>,
      <Boton
        key="archivo"
        variante={pegarPrimero ? 'secundario' : principal}
        icon="file-certificate-outline"
        onPress={() => void cargar(datos)}
        loading={cargando && !pegarPrimero}
        disabled={cargando}
      >
        {certificado ? 'Cargar otro desde un archivo' : 'Cargar desde un archivo'}
      </Boton>,
    ];
    return <View style={{ gap: espacio.chico }}>{pegarPrimero ? botones : botones.reverse()}</View>;
  };

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
              <AvisoDeVencimiento vigenteHasta={certificado.vigenteHasta} />
              {/* Al renovar, la carga va al final de los pasos. */}
              {!renovar && botonesDeCarga(titular)}
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

          {mostrarPedido && pedido.paso === 'sin_clave' && (
            <Boton icon="key-plus" onPress={() => void pedir(titular)}>
              Generar pedido de certificado
            </Boton>
          )}

          {mostrarPedido && pedido.paso === 'generando' && (
            <Boton loading disabled>
              Generando la clave…
            </Boton>
          )}

          {mostrarPedido && pedido.paso === 'fallo' && (
            <>
              <Aviso icono="alert-circle-outline" tono="error">
                No se pudo generar el pedido. Verificá que el teléfono tenga bloqueo de pantalla y
                probá de nuevo.
              </Aviso>
              <Boton onPress={() => void pedir(titular)}>Reintentar</Boton>
            </>
          )}

          {mostrarPedido && pedido.paso === 'listo' && (
            <View style={{ gap: espacio.medio }}>
              <Texto variante="subtitulo">
                {renovar ? 'Para renovarlo' : 'Tu pedido está listo'}
              </Texto>
              <Texto variante="cuerpo">1. Mandá el pedido a tu computadora o guardalo.</Texto>
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
              <Texto variante="cuerpo">
                2. {(renovar ? DONDE_RENOVARLO : DONDE_SUBIRLO)[titular.ambiente]}
              </Texto>
              <Texto variante="cuerpo">3. {COMO_CARGARLO[titular.ambiente]}</Texto>
              {botonesDeCarga(titular)}
            </View>
          )}
        </ScrollView>
      )}
    </Pantalla>
  );
}
