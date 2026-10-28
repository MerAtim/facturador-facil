import { Aviso, Boton, Texto, useTema } from '@facturador/ui';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { registro } from '../composicion';
import { guardarLogo, leerLogo, quitarLogo, type MotivoLogoRechazado } from './logoDelEmisor';

const MENSAJE: Readonly<Record<MotivoLogoRechazado, string>> = {
  archivo_demasiado_grande: 'La imagen pesa más de 10 MB. Elegí una más liviana.',
  formato_no_admitido: 'Elegí una imagen PNG o JPG.',
  imagen_ilegible: 'No se pudo leer la imagen. Probá con otra.',
  demasiados_pixeles: 'La imagen tiene demasiada resolución. Elegí una más chica.',
  no_se_pudo_procesar: 'No se pudo preparar la imagen. Probá con otra.',
};

type Origen = 'galeria' | 'archivos';

interface Elegida {
  readonly uri: string;
  readonly tamanio?: number;
}

async function elegir(origen: Origen): Promise<Elegida | undefined> {
  if (origen === 'galeria') {
    const eleccion = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
      // En iOS convierte HEIC a JPEG, que es lo que la app sabe validar.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    const [imagen] = eleccion.canceled ? [] : eleccion.assets;
    return imagen && { uri: imagen.uri, ...(imagen.fileSize && { tamanio: imagen.fileSize }) };
  }
  const eleccion = await DocumentPicker.getDocumentAsync({
    type: ['image/png', 'image/jpeg'],
    copyToCacheDirectory: true,
  });
  const [documento] = eleccion.canceled ? [] : eleccion.assets;
  return documento && { uri: documento.uri, ...(documento.size && { tamanio: documento.size }) };
}

/** Los selectores dejan una copia en la caché: ya procesada, no hace falta conservarla. */
function borrarCopia(uri: string) {
  try {
    const copia = new File(uri);
    if (uri.startsWith(Paths.cache.uri) && copia.exists) copia.delete();
  } catch (error) {
    registro.error('no se pudo borrar la copia de la imagen elegida', error);
  }
}

/** El logo opcional que va en los comprobantes. Se guarda al elegirlo, sin esperar a Guardar. */
export function EleccionDeLogo() {
  const { colores, espacio } = useTema();
  const [logo, setLogo] = useState<string>();
  const [procesando, setProcesando] = useState(false);
  const [rechazo, setRechazo] = useState<string>();

  useEffect(() => {
    leerLogo().then(setLogo, (error: unknown) => {
      registro.error('no se pudo leer el logo', error);
    });
  }, []);

  const cambiar = async (origen: Origen) => {
    setRechazo(undefined);
    const elegida = await elegir(origen);
    if (!elegida) return;

    setProcesando(true);
    try {
      const resultado = await guardarLogo(elegida.uri, elegida.tamanio);
      if (resultado.ok) setLogo(resultado.valor);
      else setRechazo(MENSAJE[resultado.error]);
    } catch (error) {
      registro.error('no se pudo guardar el logo', error);
      setRechazo(MENSAJE.no_se_pudo_procesar);
    } finally {
      borrarCopia(elegida.uri);
      setProcesando(false);
    }
  };

  const quitar = () => {
    try {
      quitarLogo();
      setLogo(undefined);
    } catch (error) {
      registro.error('no se pudo quitar el logo', error);
      setRechazo('No se pudo quitar el logo. Probá de nuevo.');
    }
  };

  return (
    <View style={{ gap: espacio.chico }}>
      <Texto variante="etiqueta">Logo (opcional)</Texto>
      {logo !== undefined && (
        // Sobre blanco, como va a salir impreso.
        <View style={[estilos.marco, { borderColor: colores.outlineVariant }]}>
          <Image
            source={{ uri: `data:image/png;base64,${logo}` }}
            style={estilos.logo}
            resizeMode="contain"
            accessibilityLabel="Tu logo"
          />
        </View>
      )}
      {rechazo !== undefined && (
        <Aviso icono="alert-circle-outline" tono="error">
          {rechazo}
        </Aviso>
      )}
      <View style={[estilos.fila, { gap: espacio.chico }]}>
        <Boton
          variante="secundario"
          icon="image-outline"
          onPress={() => void cambiar('galeria')}
          disabled={procesando}
          loading={procesando}
          style={estilos.boton}
        >
          Galería
        </Boton>
        <Boton
          variante="secundario"
          icon="folder-outline"
          onPress={() => void cambiar('archivos')}
          disabled={procesando}
          style={estilos.boton}
        >
          Archivos
        </Boton>
      </View>
      {logo !== undefined && (
        <Boton variante="texto" icon="delete-outline" onPress={quitar} disabled={procesando}>
          Quitar el logo
        </Boton>
      )}
      <Texto variante="detalle">
        Va arriba a la izquierda en cada comprobante. PNG o JPG; la app lo achica y lo guarda sin
        los datos de la foto.
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  marco: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  logo: { width: '100%', height: 80 },
  fila: { flexDirection: 'row' },
  boton: { flex: 1 },
});
