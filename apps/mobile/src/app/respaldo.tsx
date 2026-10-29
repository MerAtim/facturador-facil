import {
  LARGO_MINIMO_DE_LA_CONTRASENA,
  type ProblemaAlRestaurar,
  type Restaurado,
} from '@facturador/aplicacion';
import { FechaCalendario } from '@facturador/dominio';
import { TAMANIO_MAXIMO_DEL_RESPALDO } from '@facturador/respaldo';
import { Aviso, Boton, CampoDeTexto, Pantalla, Tarjeta, Texto, useTema } from '@facturador/ui';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { registro } from '../composicion';
import { compartirRespaldo, respaldo } from '../respaldo/respaldoDelDispositivo';

/** Respaldar los datos para recuperarlos en otro teléfono, o restaurar un respaldo. */
export default function Respaldo() {
  const { espacio } = useTema();

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Respaldo' }} />
      <ScrollView
        contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}
        keyboardShouldPersistTaps="handled"
      >
        <Texto variante="cuerpo">
          El respaldo guarda tus datos de emisor, tus clientes, tu catálogo, tus comprobantes y tu
          logo en un archivo cifrado con una contraseña. Sirve para recuperarlos si cambiás de
          teléfono. No incluye el certificado de ARCA: en el teléfono nuevo vas a pedir otro.
        </Texto>
        <CrearRespaldo />
        <RestaurarRespaldo />
      </ScrollView>
    </Pantalla>
  );
}

function CrearRespaldo() {
  const { espacio } = useTema();
  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [creando, setCreando] = useState(false);
  const [problema, setProblema] = useState<string>();

  const crear = async () => {
    setProblema(undefined);
    if (contrasena.length < LARGO_MINIMO_DE_LA_CONTRASENA) {
      setProblema(
        `La contraseña tiene que tener al menos ${String(LARGO_MINIMO_DE_LA_CONTRASENA)} caracteres.`,
      );
      return;
    }
    if (contrasena !== repetida) {
      setProblema('Las contraseñas no coinciden.');
      return;
    }
    setCreando(true);
    try {
      const archivo = await respaldo.crear(contrasena);
      if (!archivo.ok) {
        setProblema('Primero cargá tus datos de emisor: no hay nada para respaldar.');
        return;
      }
      const hoy = FechaCalendario.enArgentina(new Date()).aTextoArca();
      await compartirRespaldo(archivo.valor, hoy);
      // La contraseña no queda a la vista una vez usada.
      setContrasena('');
      setRepetida('');
    } catch (error) {
      registro.error('no se pudo crear el respaldo', error);
      setProblema('No se pudo crear el respaldo. Probá de nuevo.');
    } finally {
      setCreando(false);
    }
  };

  return (
    <Tarjeta>
      <Texto variante="subtitulo">Crear un respaldo</Texto>
      <View style={{ gap: espacio.medio }}>
        <CampoDeTexto etiqueta="Contraseña" valor={contrasena} onCambiar={setContrasena} secreto />
        <CampoDeTexto
          etiqueta="Repetí la contraseña"
          valor={repetida}
          onCambiar={setRepetida}
          secreto
        />
        <Texto variante="detalle">
          Si olvidás la contraseña, no hay forma de recuperar el respaldo. Guardá el archivo fuera
          del teléfono, por ejemplo en tu correo o en la nube.
        </Texto>
        {problema !== undefined && (
          <Aviso icono="alert-circle-outline" tono="error">
            {problema}
          </Aviso>
        )}
        <Boton
          icon="content-save-outline"
          onPress={() => void crear()}
          loading={creando}
          disabled={creando}
        >
          {creando ? 'Cifrando…' : 'Crear y guardar el respaldo'}
        </Boton>
      </View>
    </Tarjeta>
  );
}

interface Elegido {
  readonly nombre: string;
  readonly bytes: Uint8Array;
}

function RestaurarRespaldo() {
  const { espacio } = useTema();
  const router = useRouter();
  const [elegido, setElegido] = useState<Elegido>();
  const [contrasena, setContrasena] = useState('');
  const [restaurando, setRestaurando] = useState(false);
  const [problema, setProblema] = useState<string>();
  const [restaurado, setRestaurado] = useState<Restaurado>();

  const elegir = async () => {
    setProblema(undefined);
    setRestaurado(undefined);
    const eleccion = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
    const [archivo] = eleccion.canceled ? [] : eleccion.assets;
    if (!archivo) return;
    try {
      const enDisco = new File(archivo.uri);
      // El tamaño se mira antes de leerlo, para no cargar en memoria un archivo enorme.
      if ((archivo.size ?? enDisco.size) > TAMANIO_MAXIMO_DEL_RESPALDO) {
        setProblema('El archivo es demasiado grande para ser un respaldo.');
        return;
      }
      setElegido({ nombre: archivo.name, bytes: await enDisco.bytes() });
    } catch (error) {
      registro.error('no se pudo leer el respaldo elegido', error);
      setProblema('No se pudo leer el archivo. Probá de nuevo.');
    }
  };

  const restaurar = async (archivo: Elegido) => {
    setProblema(undefined);
    setRestaurando(true);
    try {
      const resultado = await respaldo.restaurar(archivo.bytes, contrasena);
      if (resultado.ok) {
        setRestaurado(resultado.valor);
        setElegido(undefined);
        setContrasena('');
      } else {
        setProblema(explicar(resultado.error));
      }
    } catch (error) {
      registro.error('no se pudo restaurar el respaldo', error);
      setProblema('No se pudo restaurar el respaldo. Probá de nuevo.');
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <Tarjeta>
      <Texto variante="subtitulo">Restaurar un respaldo</Texto>
      <View style={{ gap: espacio.medio }}>
        <Texto variante="detalle">
          Suma lo que falta en este teléfono, sin borrar ni cambiar lo que ya tiene.
        </Texto>
        <Boton variante="secundario" icon="file-upload-outline" onPress={() => void elegir()}>
          {elegido ? `Elegido: ${elegido.nombre}` : 'Elegir el archivo del respaldo'}
        </Boton>
        {elegido && (
          <>
            <CampoDeTexto
              etiqueta="Contraseña del respaldo"
              valor={contrasena}
              onCambiar={setContrasena}
              secreto
            />
            <Boton
              icon="backup-restore"
              onPress={() => void restaurar(elegido)}
              loading={restaurando}
              disabled={restaurando || contrasena === ''}
            >
              {restaurando ? 'Restaurando…' : 'Restaurar'}
            </Boton>
          </>
        )}
        {problema !== undefined && (
          <Aviso icono="alert-circle-outline" tono="error">
            {problema}
          </Aviso>
        )}
        {restaurado && (
          <>
            <Aviso icono="check-circle-outline">{resumen(restaurado)}</Aviso>
            {restaurado.configuracion && (
              <Boton
                icon="arrow-right"
                onPress={() => {
                  router.push('/alta');
                }}
              >
                Pedir el certificado
              </Boton>
            )}
          </>
        )}
      </View>
    </Tarjeta>
  );
}

const cantidad = (numero: number, singular: string, plural: string) =>
  `${String(numero)} ${numero === 1 ? singular : plural}`;

function resumen(restaurado: Restaurado): string {
  const partes = [
    cantidad(restaurado.comprobantes, 'comprobante', 'comprobantes'),
    cantidad(restaurado.clientes, 'cliente nuevo', 'clientes nuevos'),
    cantidad(restaurado.productos, 'producto nuevo', 'productos nuevos'),
    ...(restaurado.configuracion ? ['tus datos de emisor'] : []),
    ...(restaurado.logo ? ['tu logo'] : []),
  ];
  const lista = `${partes.slice(0, -1).join(', ')} y ${partes.at(-1) ?? ''}`;
  const descartados =
    restaurado.descartados > 0
      ? ` ${cantidad(restaurado.descartados, 'comprobante', 'comprobantes')} del respaldo no pasaron las validaciones y no se restauraron.`
      : '';
  const certificado = restaurado.configuracion
    ? ' Para facturar falta pedir el certificado de ARCA en este teléfono.'
    : '';
  return `Listo: el teléfono tiene ${lista} del respaldo.${descartados}${certificado}`;
}

function explicar(problema: ProblemaAlRestaurar): string {
  switch (problema.tipo) {
    case 'otro_emisor':
      return `El respaldo es del CUIT ${problema.cuit.formateado()} y este teléfono factura con otro.`;
    case 'contenido_invalido':
      return 'El respaldo está dañado y no se puede restaurar.';
    case 'respaldo_ilegible':
      switch (problema.motivo) {
        case 'contrasena_incorrecta_o_archivo_danado':
          return 'La contraseña no es la del respaldo, o el archivo se dañó.';
        case 'version_desconocida':
          return 'El respaldo es de una versión más nueva de la app. Actualizala y probá de nuevo.';
        case 'demasiado_grande':
          return 'El archivo es demasiado grande para ser un respaldo.';
        case 'no_es_un_respaldo':
        case 'costo_no_admitido':
          return 'El archivo no es un respaldo de Facturador Fácil.';
      }
  }
}
