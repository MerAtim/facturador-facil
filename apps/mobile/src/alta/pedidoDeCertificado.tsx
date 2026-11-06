import {
  aliasDeClave,
  crearPedidoDeCertificado,
  nombreDelArchivoDePedido,
  type Titular,
} from '@facturador/arca';
import { Aviso, Boton, useTema } from '@facturador/ui';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { almacenDeClavesDelDispositivo } from '../arca/almacenDeClavesDelDispositivo';
import { registro } from '../composicion';
import { useProteccion } from '../seguridad/Bloqueo';

export type EstadoDelPedido =
  | { readonly paso: 'sin_clave' }
  | { readonly paso: 'generando' }
  | { readonly paso: 'listo'; readonly pem: string }
  | { readonly paso: 'fallo' };

export interface PedidoDeCertificado {
  readonly estado: EstadoDelPedido;
  readonly pedir: () => void;
  readonly compartir: () => void;
  readonly copiar: () => void;
  readonly copiado: boolean;
  readonly noSeCompartio: boolean;
}

/**
 * El pedido de certificado del titular. Si la clave ya existe, el pedido se arma solo, porque es
 * instantáneo; la primera vez lo pide el usuario, ya que crear la clave exige el bloqueo.
 */
export function usePedidoDeCertificado(titular: Titular | undefined): PedidoDeCertificado {
  const [estado, setEstado] = useState<EstadoDelPedido>({ paso: 'sin_clave' });
  const [copiado, setCopiado] = useState(false);
  const [noSeCompartio, setNoSeCompartio] = useState(false);

  const pedir = async (datos: Titular) => {
    setEstado({ paso: 'generando' });
    try {
      setEstado({
        paso: 'listo',
        pem: await crearPedidoDeCertificado(datos, almacenDeClavesDelDispositivo),
      });
    } catch (error) {
      registro.error('no se pudo generar el pedido de certificado', error);
      setEstado({ paso: 'fallo' });
    }
  };

  // El titular se identifica por el alias de su clave.
  const alias = titular && aliasDeClave(titular);
  useEffect(() => {
    if (titular && alias && almacenDeClavesDelDispositivo.existeClave(alias)) void pedir(titular);
  }, [alias]);

  const compartir = async (pem: string, datos: Titular) => {
    setNoSeCompartio(false);
    try {
      // El pedido no es secreto: tiene la clave pública y los datos del contribuyente.
      const archivo = new File(Paths.cache, nombreDelArchivoDePedido(datos));
      if (archivo.exists) archivo.delete();
      await archivo.write(pem);
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

  return {
    estado,
    pedir: () => {
      if (titular) void pedir(titular);
    },
    compartir: () => {
      if (titular && estado.paso === 'listo') void compartir(estado.pem, titular);
    },
    copiar: () => {
      if (estado.paso === 'listo') void copiar(estado.pem);
    },
    copiado,
    noSeCompartio,
  };
}

/** Lo que falta para tener el pedido: el bloqueo, generarlo o reintentar. Listo, no muestra nada. */
export function PrepararElPedido({ pedido }: { readonly pedido: PedidoDeCertificado }) {
  const protegida = useProteccion();
  switch (pedido.estado.paso) {
    case 'sin_clave':
      return protegida ? (
        <Boton icon="key-plus" onPress={pedido.pedir}>
          Generar pedido de certificado
        </Boton>
      ) : (
        <FaltaElBloqueo />
      );
    case 'generando':
      return (
        <Boton loading disabled>
          Generando la clave…
        </Boton>
      );
    case 'fallo':
      return (
        <>
          <Aviso icono="alert-circle-outline" tono="error">
            No se pudo generar el pedido. Verificá que el teléfono tenga bloqueo de pantalla y probá
            de nuevo.
          </Aviso>
          <Boton onPress={pedido.pedir}>Reintentar</Boton>
        </>
      );
    case 'listo':
      return null;
  }
}

/** Guardar o copiar el pedido listo, para subirlo a ARCA. */
export function GuardarElPedido({ pedido }: { readonly pedido: PedidoDeCertificado }) {
  const { espacio } = useTema();
  if (pedido.estado.paso !== 'listo') return null;
  return (
    <View style={{ gap: espacio.chico }}>
      <Boton variante="secundario" icon="share-variant" onPress={pedido.compartir}>
        Compartir pedido
      </Boton>
      {pedido.noSeCompartio && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se pudo compartir el pedido. Probá copiarlo como texto.
        </Aviso>
      )}
      <Boton variante="texto" icon="content-copy" onPress={pedido.copiar}>
        {pedido.copiado ? 'Copiado' : 'Copiar como texto'}
      </Boton>
    </View>
  );
}

/**
 * La clave solo firma con el teléfono desbloqueado, y en Android 9 a 14 el sistema no la crea si
 * no hay bloqueo de pantalla. Se explica antes de intentarlo, en lugar de mostrar un error.
 */
function FaltaElBloqueo() {
  const { espacio } = useTema();
  return (
    <View style={{ gap: espacio.chico }}>
      <Aviso icono="shield-lock-outline" tono="error">
        Para crear la clave, el teléfono tiene que tener bloqueo de pantalla: un PIN, un patrón o tu
        huella. Así nadie puede emitir facturas en tu nombre si lo pierde.
      </Aviso>
      {/* iOS no deja abrir directamente los ajustes del código. */}
      {Platform.OS === 'android' && (
        <Boton
          icon="cog-outline"
          onPress={() => {
            Linking.sendIntent('android.settings.SECURITY_SETTINGS').catch(() =>
              Linking.openSettings(),
            );
          }}
        >
          Configurar el bloqueo
        </Boton>
      )}
    </View>
  );
}
