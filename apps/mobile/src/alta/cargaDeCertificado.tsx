import type { Ambiente } from '@facturador/aplicacion';
import {
  TAMANIO_MAXIMO_DEL_CERTIFICADO,
  validarCertificado,
  type CertificadoGuardado,
  type MotivoCertificadoInvalido,
  type Titular,
} from '@facturador/arca';
import { Aviso, Boton, useTema } from '@facturador/ui';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { View } from 'react-native';

import { almacenDeClavesDelDispositivo } from '../arca/almacenDeClavesDelDispositivo';
import { almacenDeCertificados, olvidarEmisiones, registro, registroDeAlta } from '../composicion';

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

export interface CargaDeCertificado {
  readonly cargar: () => void;
  readonly pegar: () => void;
  readonly cargando: boolean;
  /** Por qué no se aceptó lo último que se intentó cargar. */
  readonly rechazo?: string;
}

/**
 * Cargar el certificado que da ARCA, desde un archivo o pegado. Se valida como cualquier entrada y
 * solo se guarda si corresponde a la clave de este teléfono.
 */
export function useCargaDeCertificado(
  titular: Titular | undefined,
  alCargar: (certificado: CertificadoGuardado) => void,
): CargaDeCertificado {
  const [cargando, setCargando] = useState(false);
  const [rechazo, setRechazo] = useState<string>();

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
    alCargar(resultado.valor);
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

  return {
    cargar: () => {
      if (titular) void cargar(titular);
    },
    pegar: () => {
      if (titular) void pegar(titular);
    },
    cargando,
    ...(rechazo !== undefined && { rechazo }),
  };
}

/** Homologación muestra el certificado como texto; producción lo descarga como archivo. */
export function BotonesDeCarga({
  carga,
  ambiente,
  hayCertificado,
}: {
  readonly carga: CargaDeCertificado;
  readonly ambiente: Ambiente;
  /** Con uno ya cargado, cargar otro deja de ser la acción principal. */
  readonly hayCertificado: boolean;
}) {
  const { espacio } = useTema();
  const { cargar, pegar, cargando, rechazo } = carga;
  const principal = hayCertificado ? 'secundario' : 'principal';
  const pegarPrimero = ambiente === 'homologacion';
  const botones = [
    <Boton
      key="pegar"
      variante={pegarPrimero ? principal : 'secundario'}
      icon="content-paste"
      onPress={pegar}
      loading={cargando && pegarPrimero}
      disabled={cargando}
    >
      {hayCertificado ? 'Pegar otro certificado' : 'Pegar certificado'}
    </Boton>,
    <Boton
      key="archivo"
      variante={pegarPrimero ? 'secundario' : principal}
      icon="file-certificate-outline"
      onPress={cargar}
      loading={cargando && !pegarPrimero}
      disabled={cargando}
    >
      {hayCertificado ? 'Cargar otro desde un archivo' : 'Cargar desde un archivo'}
    </Boton>,
  ];
  return (
    <View style={{ gap: espacio.chico }}>
      {rechazo !== undefined && (
        <Aviso icono="alert-circle-outline" tono="error">
          {rechazo}
        </Aviso>
      )}
      {pegarPrimero ? botones : botones.reverse()}
    </View>
  );
}
