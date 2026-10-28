import type {
  Ambiente,
  Configuracion,
  EstadoDePaso,
  PasoDeAlta,
  PasoEnArca,
} from '@facturador/aplicacion';
import {
  explicarVerificacion,
  type EtapaDeVerificacion,
  type MensajeDeVerificacion,
} from '@facturador/arca';
import type { CondicionEmisor } from '@facturador/dominio';
import {
  Aviso,
  Boton,
  Icono,
  Pantalla,
  PasoDeGuia,
  Recorrido,
  Texto,
  useTema,
  type ParadaDelRecorrido,
} from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAlta } from '../alta/useAlta';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { registro, registroDeAlta, verificarAltaDe } from '../composicion';

const TITULOS: Readonly<Record<PasoDeAlta, string>> = {
  datos: 'Tus datos de emisor',
  certificado: 'Certificado de ARCA',
  autorizacion: 'Autorizar la factura electrónica',
  punto_de_venta: 'Punto de venta web service',
  verificacion: 'Verificar con ARCA',
};

const RESUMENES: Readonly<Record<PasoDeAlta, string>> = {
  datos: 'Razón social, CUIT, condición y punto de venta.',
  certificado: 'Identifica a la app ante ARCA. Su clave no sale del teléfono.',
  autorizacion: 'Permite que el certificado facture con tu CUIT.',
  punto_de_venta: 'El número con el que se emiten las facturas desde la app.',
  verificacion: 'Prueba todo junto, sin emitir nada.',
};

const ETAPAS: readonly EtapaDeVerificacion[] = ['conexion', 'acceso', 'punto_de_venta'];

/** En ARCA el sistema del punto de venta depende de la condición frente al IVA. */
const SISTEMA_DEL_PUNTO_DE_VENTA: Readonly<Record<CondicionEmisor, string>> = {
  monotributo: 'Factura Electrónica - Monotributo - Web Services',
  responsable_inscripto: 'RECE para aplicativo y web services',
  exento: 'RECE para aplicativo y web services',
};

const AUTORIZACION: Readonly<Record<Ambiente, readonly ParadaDelRecorrido[]>> = {
  homologacion: [
    { texto: 'Entrá al sitio de ARCA con tu clave fiscal' },
    { texto: 'WSASS - Autogestión Certificados Homologación' },
    { texto: 'Crear autorización a servicio' },
    { texto: 'Nombre simbólico del DN', valor: 'El que elegiste al crear el certificado' },
    { texto: 'CUIT representada', valor: 'La tuya' },
    { texto: 'Servicio', valor: 'wsfe - Facturación Electrónica' },
    { texto: 'Crear autorización de acceso' },
  ],
  produccion: [
    { texto: 'Entrá al sitio de ARCA con tu clave fiscal' },
    { texto: 'Administrador de Relaciones de Clave Fiscal' },
    { texto: 'Nueva Relación' },
    { texto: 'Buscar', valor: 'ARCA › WebServices › Facturación Electrónica' },
    { texto: 'Representante', valor: 'Computador fiscal: el alias de tu certificado' },
    { texto: 'Confirmar' },
  ],
};

const AYUDA_DE_AUTORIZACION: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'Si no ves WSASS entre tus servicios, adherilo desde el Administrador de Relaciones de Clave Fiscal.',
  produccion:
    'El alias es el nombre que le pusiste al certificado en Administración de Certificados Digitales.',
};

const puntoDeVentaEnArca = (numero: number, condicion: CondicionEmisor): ParadaDelRecorrido[] => [
  { texto: 'Entrá al sitio de ARCA con tu clave fiscal' },
  { texto: 'Administración de puntos de venta y domicilios' },
  { texto: 'A/B/M de Puntos de venta' },
  { texto: 'Agregar' },
  { texto: 'Número', valor: String(numero) },
  { texto: 'Sistema', valor: SISTEMA_DEL_PUNTO_DE_VENTA[condicion] },
  { texto: 'Domicilio', valor: 'El de tu actividad' },
  { texto: 'Aceptar' },
];

type Verificacion =
  | { readonly estado: 'sin_hacer' }
  | { readonly estado: 'verificando' }
  | { readonly estado: 'exito' }
  | {
      readonly estado: 'fallo';
      readonly etapa: EtapaDeVerificacion;
      readonly mensaje: MensajeDeVerificacion;
    }
  | { readonly estado: 'sin_certificado' };

export default function Alta() {
  const router = useRouter();
  const { espacio } = useTema();
  const [guia, recargar] = useAlta();
  const [abierto, setAbierto] = useState<PasoDeAlta | null>();
  const [verificacion, setVerificacion] = useState<Verificacion>({ estado: 'sin_hacer' });

  if (guia.estado === 'cargando') return <Pantalla conEncabezado>{null}</Pantalla>;

  if (guia.estado === 'no_disponible') {
    return (
      <Pantalla conEncabezado style={{ padding: espacio.normal }}>
        <Aviso icono="alert-circle-outline" tono="error">
          No se pudieron leer tus datos. Desbloqueá el teléfono y volvé a abrir la app.
        </Aviso>
      </Pantalla>
    );
  }

  const { configuracion, progreso, alta } = guia;
  // Sin elegir, queda abierto el paso donde se retoma.
  const pasoAbierto = abierto === undefined ? alta.actual : abierto;

  const alternar = (paso: PasoDeAlta) => {
    setAbierto(pasoAbierto === paso ? null : paso);
  };

  const marcar = async (config: Configuracion, paso: PasoEnArca, hecho: boolean) => {
    const titular = { ambiente: config.ambiente, cuit: config.emisor.datos.cuit };
    await registroDeAlta.marcar(titular, paso, hecho);
    // Al marcarlo, se pasa al siguiente.
    setAbierto(undefined);
    recargar();
  };

  const verificar = async (config: Configuracion) => {
    setVerificacion({ estado: 'verificando' });
    const { ambiente, emisor } = config;
    const { cuit, puntoDeVenta } = emisor.datos;
    try {
      const resultado = await verificarAltaDe(config);
      if (!resultado) {
        setVerificacion({ estado: 'sin_certificado' });
        return;
      }
      if (!resultado.ok) {
        setVerificacion({
          estado: 'fallo',
          etapa: resultado.error.etapa,
          mensaje: explicarVerificacion(resultado.error, puntoDeVenta),
        });
        return;
      }
      await registroDeAlta.registrarVerificacion({ ambiente, cuit }, puntoDeVenta);
      setVerificacion({ estado: 'exito' });
      setAbierto(undefined);
      recargar();
    } catch (error) {
      registro.error('no se pudo verificar el alta', error);
      setVerificacion({
        estado: 'fallo',
        etapa: 'conexion',
        mensaje: explicarVerificacion(
          { etapa: 'conexion', tipo: 'error', error: { tipo: 'sin_conexion' } },
          puntoDeVenta,
        ),
      });
    }
  };

  const irAlPaso = (paso: PasoDeAlta) => {
    if (paso === 'certificado') router.push('/certificado');
    else if (paso === 'datos') router.push('/configuracion');
    else setAbierto(paso);
  };

  const contenido = (paso: PasoDeAlta, hecho: boolean) => {
    if (paso === 'datos') {
      return (
        <>
          <Texto variante="cuerpo">Cargalos tal como figuran en ARCA.</Texto>
          <Boton
            variante={hecho ? 'secundario' : 'principal'}
            icon="account-edit-outline"
            onPress={() => {
              router.push('/configuracion');
            }}
          >
            {hecho ? 'Revisar mis datos' : 'Cargar mis datos'}
          </Boton>
        </>
      );
    }
    if (!configuracion) return <Texto variante="cuerpo">Primero cargá tus datos de emisor.</Texto>;

    switch (paso) {
      case 'certificado':
        return (
          <>
            <Texto variante="cuerpo">
              La app genera un pedido, lo subís a ARCA y cargás el certificado que te da. En la
              pantalla del certificado están los pasos.
            </Texto>
            <Boton
              variante={hecho ? 'secundario' : 'principal'}
              icon="file-certificate-outline"
              onPress={() => {
                router.push('/certificado');
              }}
            >
              {hecho ? 'Ver el certificado' : 'Ir al certificado'}
            </Boton>
          </>
        );
      case 'autorizacion':
        return (
          <>
            <Texto variante="cuerpo">En el sitio de ARCA, desde la computadora:</Texto>
            <Recorrido paradas={AUTORIZACION[configuracion.ambiente]} />
            <Texto variante="detalle">{AYUDA_DE_AUTORIZACION[configuracion.ambiente]}</Texto>
            <MarcaDePaso
              hecho={progreso.autorizacion}
              onMarcar={(valor) => void marcar(configuracion, 'autorizacion', valor)}
            />
          </>
        );
      case 'punto_de_venta': {
        const { puntoDeVenta, condicion } = configuracion.emisor.datos;
        return (
          <>
            <Texto variante="cuerpo">
              Tiene que ser un punto de venta nuevo, solo para web service: uno que usás para
              facturar en el sitio de ARCA no sirve.
            </Texto>
            <Recorrido paradas={puntoDeVentaEnArca(puntoDeVenta, condicion)} />
            <Texto variante="detalle">
              Si el {String(puntoDeVenta)} ya está ocupado, creá otro y cambiá el número en tus
              datos de emisor.
            </Texto>
            <MarcaDePaso
              hecho={progreso.puntoDeVenta}
              onMarcar={(valor) => void marcar(configuracion, 'punto_de_venta', valor)}
            />
          </>
        );
      }
      case 'verificacion':
        return (
          <Verificar
            configuracion={configuracion}
            verificacion={verificacion}
            hecho={hecho}
            onVerificar={() => void verificar(configuracion)}
            onIrAlPaso={irAlPaso}
          />
        );
    }
  };

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Puesta en marcha' }} />
      <ScrollView contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}>
        {configuracion && <AvisoDeAmbiente ambiente={configuracion.ambiente} />}

        {alta.actual === undefined ? (
          <Aviso icono="check-decagram-outline">
            Todo listo: ARCA confirmó que podés facturar desde la app.
          </Aviso>
        ) : (
          <Texto variante="cuerpo">
            Una sola vez, para que ARCA te deje facturar desde la app. Podés dejarlo y seguir
            después: la app recuerda en qué paso quedaste.
          </Texto>
        )}

        {alta.pasos.map(({ paso, hecho }: EstadoDePaso, indice) => (
          <PasoDeGuia
            key={paso}
            numero={indice + 1}
            titulo={TITULOS[paso]}
            resumen={RESUMENES[paso]}
            hecho={hecho}
            actual={paso === alta.actual}
            abierto={paso === pasoAbierto}
            onAlternar={() => {
              alternar(paso);
            }}
          >
            {contenido(paso, hecho)}
          </PasoDeGuia>
        ))}

        {alta.actual === undefined && (
          <Boton
            icon="plus"
            onPress={() => {
              router.replace('/nueva-factura');
            }}
          >
            Nueva factura
          </Boton>
        )}
      </ScrollView>
    </Pantalla>
  );
}

/** Los pasos en ARCA no se pueden comprobar sueltos: el usuario avisa que los hizo. */
function MarcaDePaso({
  hecho,
  onMarcar,
}: {
  readonly hecho: boolean;
  readonly onMarcar: (hecho: boolean) => void;
}) {
  return hecho ? (
    <Boton
      variante="texto"
      icon="undo"
      onPress={() => {
        onMarcar(false);
      }}
    >
      Todavía no lo hice
    </Boton>
  ) : (
    <Boton
      icon="check"
      onPress={() => {
        onMarcar(true);
      }}
    >
      Ya lo hice
    </Boton>
  );
}

const nombreDeEtapa = (etapa: EtapaDeVerificacion, configuracion: Configuracion) => {
  switch (etapa) {
    case 'conexion':
      return 'Conexión con ARCA';
    case 'acceso':
      return 'Acceso con tu certificado';
    case 'punto_de_venta':
      return configuracion.ambiente === 'homologacion'
        ? 'Consulta de puntos de venta'
        : `Punto de venta ${String(configuracion.emisor.datos.puntoDeVenta)}`;
  }
};

const TITULO_DEL_PASO: Readonly<Record<PasoDeAlta, string>> = {
  datos: 'Revisar mis datos',
  certificado: 'Revisar el certificado',
  autorizacion: 'Revisar la autorización',
  punto_de_venta: 'Revisar el punto de venta',
  verificacion: 'Verificar',
};

function Verificar({
  configuracion,
  verificacion,
  hecho,
  onVerificar,
  onIrAlPaso,
}: {
  readonly configuracion: Configuracion;
  readonly verificacion: Verificacion;
  readonly hecho: boolean;
  readonly onVerificar: () => void;
  readonly onIrAlPaso: (paso: PasoDeAlta) => void;
}) {
  const { espacio } = useTema();
  const verificando = verificacion.estado === 'verificando';
  const exito = hecho || verificacion.estado === 'exito';

  const estadoDe = (etapa: EtapaDeVerificacion): EstadoDeEtapa => {
    if (exito && verificacion.estado !== 'fallo') return 'bien';
    if (verificacion.estado !== 'fallo') return 'pendiente';
    const fallida = ETAPAS.indexOf(verificacion.etapa);
    const esta = ETAPAS.indexOf(etapa);
    if (esta < fallida) return 'bien';
    return esta === fallida ? 'mal' : 'pendiente';
  };

  return (
    <>
      <Texto variante="cuerpo">
        La app prueba la conexión, el acceso con tu certificado y el punto de venta. No emite ningún
        comprobante.
      </Texto>
      {verificacion.estado !== 'sin_hacer' && verificacion.estado !== 'sin_certificado' && (
        <View style={{ gap: espacio.chico }}>
          {ETAPAS.map((etapa) => (
            <Etapa
              key={etapa}
              nombre={nombreDeEtapa(etapa, configuracion)}
              estado={verificando ? 'pendiente' : estadoDe(etapa)}
            />
          ))}
        </View>
      )}
      {verificacion.estado === 'sin_certificado' && (
        <Aviso icono="alert-circle-outline" tono="error">
          Falta cargar el certificado de ARCA.
        </Aviso>
      )}
      {verificacion.estado === 'fallo' && (
        <>
          <Aviso icono="alert-circle-outline" tono="error">
            {[verificacion.mensaje.titulo, ...verificacion.mensaje.detalles].join('. ')}{' '}
            {verificacion.mensaje.sugerencia}
          </Aviso>
          {verificacion.mensaje.codigos.length > 0 && (
            <Texto variante="detalle" selectable>
              Código de ARCA: {verificacion.mensaje.codigos.join(', ')}
            </Texto>
          )}
          {verificacion.mensaje.revisar && (
            <Boton
              variante="secundario"
              onPress={() => {
                if (verificacion.mensaje.revisar) onIrAlPaso(verificacion.mensaje.revisar);
              }}
            >
              {TITULO_DEL_PASO[verificacion.mensaje.revisar]}
            </Boton>
          )}
        </>
      )}
      <Boton
        variante={exito && verificacion.estado !== 'fallo' ? 'secundario' : 'principal'}
        icon="shield-check-outline"
        onPress={onVerificar}
        loading={verificando}
        disabled={verificando}
      >
        {verificando
          ? 'Verificando…'
          : verificacion.estado === 'sin_hacer' && !hecho
            ? 'Verificar ahora'
            : 'Verificar de nuevo'}
      </Boton>
    </>
  );
}

type EstadoDeEtapa = 'bien' | 'mal' | 'pendiente';

const ASPECTO_DE_ETAPA: Readonly<
  Record<EstadoDeEtapa, { readonly icono: string; readonly lectura: string }>
> = {
  bien: { icono: 'check-circle', lectura: 'bien' },
  mal: { icono: 'close-circle', lectura: 'con problemas' },
  pendiente: { icono: 'circle-outline', lectura: 'sin comprobar' },
};

function Etapa({ nombre, estado }: { readonly nombre: string; readonly estado: EstadoDeEtapa }) {
  const { colores, espacio } = useTema();
  const { icono, lectura } = ASPECTO_DE_ETAPA[estado];
  const color = { bien: colores.primary, mal: colores.error, pendiente: colores.outline }[estado];
  return (
    <View
      style={[estilos.etapa, { gap: espacio.chico }]}
      accessible
      accessibilityLabel={`${nombre}: ${lectura}`}
    >
      <Icono nombre={icono} color={color} />
      <Texto variante="cuerpo">{nombre}</Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  etapa: { flexDirection: 'row', alignItems: 'center' },
});
