import {
  mensajeParaElContador,
  SISTEMA_DEL_PUNTO_DE_VENTA,
  tramoDelPaso,
  tramosDeAlta,
  type Ambiente,
  type Configuracion,
  type EstadoDeTramo,
  type PasoDeAlta,
  type PasoEnArca,
  type TramoDeAlta,
} from '@facturador/aplicacion';
import {
  explicarVerificacion,
  NOMBRE_DEL_CERTIFICADO,
  type EtapaDeVerificacion,
  type MensajeDeVerificacion,
  type Titular,
} from '@facturador/arca';
import { FechaCalendario, type CondicionEmisor } from '@facturador/dominio';
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
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { AntesDeEmpezar } from '../alta/AntesDeEmpezar';
import { BotonesDeCarga, useCargaDeCertificado } from '../alta/cargaDeCertificado';
import {
  GuardarElPedido,
  PrepararElPedido,
  usePedidoDeCertificado,
} from '../alta/pedidoDeCertificado';
import { AbrirElSitioDeArca } from '../alta/sitioDeArca';
import { useAlta } from '../alta/useAlta';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { registro, registroDeAlta, verificarAltaDe } from '../composicion';

const TITULOS_DE_TRAMO: Readonly<Record<TramoDeAlta, string>> = {
  datos: 'Tus datos de emisor',
  arca: 'En el sitio de ARCA',
  verificacion: 'Verificar con ARCA',
};

const RESUMENES_DE_TRAMO: Readonly<Record<TramoDeAlta, string>> = {
  datos: 'Razón social, CUIT, condición y punto de venta.',
  arca: 'Una sola visita, con tu clave fiscal.',
  verificacion: 'Prueba todo junto, sin emitir nada.',
};

type PasoEnElSitio = Exclude<PasoDeAlta, 'datos' | 'verificacion'>;

const TITULOS_EN_ARCA: Readonly<Record<PasoEnElSitio, string>> = {
  punto_de_venta: 'Crear el punto de venta',
  certificado: 'Pedir el certificado',
  autorizacion: 'Autorizar la factura electrónica',
};

const ETAPAS: readonly EtapaDeVerificacion[] = ['conexion', 'acceso', 'punto_de_venta'];

/** El alias que se sugiere es el mismo nombre que lleva el pedido, para no inventar otro. */
const ALIAS = NOMBRE_DEL_CERTIFICADO;

const pedirCertificado = (ambiente: Ambiente): ParadaDelRecorrido[] =>
  ambiente === 'homologacion'
    ? [
        { texto: 'WSASS - Autogestión Certificados Homologación' },
        { texto: 'Nuevo Certificado' },
        { texto: 'Nombre simbólico del DN', valor: ALIAS, copiable: true },
        { texto: 'Solicitud de certificado en formato PKCS#10', valor: 'Pegá el pedido copiado' },
        { texto: 'Crear DN y obtener certificado' },
      ]
    : [
        { texto: 'Administración de Certificados Digitales' },
        { texto: 'Agregar alias' },
        { texto: 'Alias', valor: ALIAS, copiable: true },
        { texto: 'Archivo', valor: 'El pedido que guardaste' },
        { texto: 'Agregar alias' },
        { texto: 'Ver', valor: 'En la fila del alias' },
        { texto: 'Descargar' },
      ];

const COMO_CARGARLO: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'ARCA te muestra el certificado como texto: copialo entero, desde BEGIN CERTIFICATE hasta END CERTIFICATE, y pegalo acá.',
  produccion: 'Volvé a la app y cargá el certificado que descargaste.',
};

const autorizar = (ambiente: Ambiente, cuit: string): ParadaDelRecorrido[] =>
  ambiente === 'homologacion'
    ? [
        { texto: 'WSASS - Autogestión Certificados Homologación' },
        { texto: 'Crear autorización a servicio' },
        { texto: 'Nombre simbólico del DN', valor: ALIAS, copiable: true },
        { texto: 'CUIT representada', valor: cuit, copiable: true },
        { texto: 'Servicio', valor: 'wsfe - Facturación Electrónica' },
        { texto: 'Crear autorización de acceso' },
      ]
    : [
        { texto: 'Administrador de Relaciones de Clave Fiscal' },
        { texto: 'Nueva Relación' },
        { texto: 'Buscar', valor: 'ARCA › WebServices › Facturación Electrónica' },
        { texto: 'Representante', valor: `Computador fiscal › ${ALIAS}` },
        { texto: 'Confirmar' },
      ];

const AYUDA_DE_AUTORIZACION: Readonly<Record<Ambiente, string>> = {
  homologacion:
    'Si no ves WSASS entre tus servicios, adherilo desde el Administrador de Relaciones de Clave Fiscal.',
  produccion: 'Si le pusiste otro alias al certificado, elegí ese.',
};

const crearPuntoDeVenta = (numero: number, condicion: CondicionEmisor): ParadaDelRecorrido[] => [
  { texto: 'Administración de puntos de venta y domicilios' },
  { texto: 'A/B/M de Puntos de venta' },
  { texto: 'Agregar' },
  { texto: 'Número', valor: String(numero), copiable: true },
  { texto: 'Sistema', valor: SISTEMA_DEL_PUNTO_DE_VENTA[condicion] },
  { texto: 'Domicilio', valor: 'El de tu actividad' },
  { texto: 'Aceptar' },
];

const copiar = (valor: string) => {
  void Clipboard.setStringAsync(valor);
};

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
  const [abierto, setAbierto] = useState<TramoDeAlta | null>();
  const [verificacion, setVerificacion] = useState<Verificacion>({ estado: 'sin_hacer' });

  const configuracion = guia.estado === 'lista' ? guia.configuracion : undefined;
  const titular: Titular | undefined = configuracion && {
    ambiente: configuracion.ambiente,
    cuit: configuracion.emisor.datos.cuit,
    razonSocial: configuracion.emisor.datos.razonSocial,
  };
  const pedido = usePedidoDeCertificado(titular);
  const carga = useCargaDeCertificado(titular, recargar);

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

  const { alta, vigenteHasta } = guia;
  const tramos = tramosDeAlta(alta);
  const tramoActual = alta.actual && tramoDelPaso(alta.actual);
  // Sin elegir, queda abierto el tramo donde se retoma.
  const tramoAbierto = abierto === undefined ? tramoActual : abierto;
  // Los datos de emisor no cuentan: todavía no se hizo nada en ARCA.
  const sinEmpezar = alta.pasos.every(({ paso, hecho }) => paso === 'datos' || !hecho);

  const alternar = (tramo: TramoDeAlta) => {
    setAbierto(tramoAbierto === tramo ? null : tramo);
  };

  const marcar = async (config: Configuracion, paso: PasoEnArca, hecho: boolean) => {
    const titularDelAlta = { ambiente: config.ambiente, cuit: config.emisor.datos.cuit };
    await registroDeAlta.marcar(titularDelAlta, paso, hecho);
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
    if (paso === 'datos') router.push('/configuracion');
    else setAbierto(tramoDelPaso(paso));
  };

  const enElSitio = (config: Configuracion, paso: PasoEnElSitio, hecho: boolean) => {
    switch (paso) {
      case 'punto_de_venta': {
        const { puntoDeVenta, condicion } = config.emisor.datos;
        if (hecho) {
          return (
            <MarcaDePaso hecho onMarcar={(valor) => void marcar(config, 'punto_de_venta', valor)} />
          );
        }
        return (
          <>
            <Texto variante="cuerpo">
              Tiene que ser nuevo, solo para la app: el que usás para facturar en el sitio de ARCA
              no sirve.
            </Texto>
            <Recorrido paradas={crearPuntoDeVenta(puntoDeVenta, condicion)} onCopiar={copiar} />
            <Texto variante="detalle">
              Si el {String(puntoDeVenta)} ya está ocupado, creá otro y cambiá el número en tus
              datos de emisor.
            </Texto>
            <MarcaDePaso
              hecho={false}
              onMarcar={(valor) => void marcar(config, 'punto_de_venta', valor)}
            />
          </>
        );
      }
      case 'certificado':
        if (hecho && vigenteHasta) {
          return (
            <>
              <Texto variante="cuerpo">
                Cargado. Vence el {FechaCalendario.enArgentina(vigenteHasta).formatear()}.
              </Texto>
              <Boton
                variante="texto"
                icon="file-certificate-outline"
                onPress={() => {
                  router.push('/certificado');
                }}
              >
                Ver el certificado
              </Boton>
            </>
          );
        }
        return (
          <>
            <Recorrido paradas={pedirCertificado(config.ambiente)} onCopiar={copiar} />
            <Texto variante="cuerpo">{COMO_CARGARLO[config.ambiente]}</Texto>
            <BotonesDeCarga carga={carga} ambiente={config.ambiente} hayCertificado={false} />
          </>
        );
      case 'autorizacion':
        if (hecho) {
          return (
            <MarcaDePaso hecho onMarcar={(valor) => void marcar(config, 'autorizacion', valor)} />
          );
        }
        return (
          <>
            <Recorrido
              paradas={autorizar(config.ambiente, config.emisor.datos.cuit.valor)}
              onCopiar={copiar}
            />
            <Texto variante="detalle">{AYUDA_DE_AUTORIZACION[config.ambiente]}</Texto>
            <MarcaDePaso
              hecho={false}
              onMarcar={(valor) => void marcar(config, 'autorizacion', valor)}
            />
          </>
        );
    }
  };

  const contenido = ({ tramo, pasos, hecho }: EstadoDeTramo) => {
    if (tramo === 'datos') {
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

    if (tramo === 'verificacion') {
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

    const enArca = pasos.flatMap(({ paso, hecho: listo }) =>
      paso === 'datos' || paso === 'verificacion' ? [] : [{ paso, listo }],
    );
    return (
      <>
        {vigenteHasta === undefined && (
          <>
            <Texto variante="cuerpo">
              Entrás una vez y hacés todo seguido. Antes, prepará el pedido del certificado y
              guardalo en el teléfono: lo vas a subir a ARCA.
            </Texto>
            <PrepararElPedido pedido={pedido} />
            <GuardarElPedido pedido={pedido} />
          </>
        )}
        <AbrirElSitioDeArca />
        {vigenteHasta === undefined && <QueLoHagaTuContador configuracion={configuracion} />}
        {enArca.map(({ paso, listo }, indice) => (
          <ParteDeLaVisita
            key={paso}
            letra={LETRAS[indice] ?? ''}
            titulo={TITULOS_EN_ARCA[paso]}
            hecho={listo}
          >
            {enElSitio(configuracion, paso, listo)}
          </ParteDeLaVisita>
        ))}
      </>
    );
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
        ) : sinEmpezar ? (
          <AntesDeEmpezar />
        ) : (
          <>
            <Texto variante="cuerpo">
              Una sola vez, para que ARCA te deje facturar desde la app. Podés dejarlo y seguir
              después: la app recuerda en qué paso quedaste.
            </Texto>
            <Boton
              variante="texto"
              icon="shield-check-outline"
              onPress={() => {
                router.push('/sobre-el-certificado');
              }}
            >
              Qué puede hacer el certificado
            </Boton>
          </>
        )}

        {tramos.map((estado, indice) => (
          <PasoDeGuia
            key={estado.tramo}
            numero={indice + 1}
            titulo={TITULOS_DE_TRAMO[estado.tramo]}
            resumen={RESUMENES_DE_TRAMO[estado.tramo]}
            hecho={estado.hecho}
            actual={estado.tramo === tramoActual}
            abierto={estado.tramo === tramoAbierto}
            onAlternar={() => {
              alternar(estado.tramo);
            }}
          >
            {contenido(estado)}
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

const LETRAS = ['a', 'b', 'c'] as const;

/**
 * Quien ya administra la clave fiscal puede hacer la visita a ARCA: recibe los pasos en un mensaje
 * y el pedido aparte, y devuelve el certificado. La clave sigue sin salir del teléfono.
 */
function QueLoHagaTuContador({ configuracion }: { readonly configuracion: Configuracion }) {
  const { espacio } = useTema();
  const [noSeCompartio, setNoSeCompartio] = useState(false);

  const mandar = async () => {
    setNoSeCompartio(false);
    const { ambiente, emisor } = configuracion;
    const { razonSocial, cuit, condicion, puntoDeVenta } = emisor.datos;
    try {
      await Share.share({
        message: mensajeParaElContador({
          ambiente,
          razonSocial,
          cuit,
          condicion,
          puntoDeVenta,
          alias: ALIAS,
        }),
      });
    } catch (error) {
      registro.error('no se pudieron compartir los pasos para el contador', error);
      setNoSeCompartio(true);
    }
  };

  return (
    <View style={{ gap: espacio.chico }}>
      <Boton variante="texto" icon="account-tie-outline" onPress={() => void mandar()}>
        Que lo haga tu contador
      </Boton>
      <Texto variante="detalle">
        Le mandás los pasos en un mensaje y, aparte, el pedido. Cuando te devuelva el certificado,
        lo cargás en el paso b.
      </Texto>
      {noSeCompartio && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se pudieron compartir los pasos. Probá de nuevo.
        </Aviso>
      )}
    </View>
  );
}

/** Una de las cosas que se hacen en la visita a ARCA, con su estado a la vista. */
function ParteDeLaVisita({
  letra,
  titulo,
  hecho,
  children,
}: {
  readonly letra: string;
  readonly titulo: string;
  readonly hecho: boolean;
  readonly children: ReactNode;
}) {
  const { colores, espacio } = useTema();
  return (
    <View style={{ gap: espacio.medio, paddingTop: espacio.chico }}>
      <View
        style={[estilos.etapa, { gap: espacio.chico }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${letra}. ${titulo}. ${hecho ? 'Hecho' : 'Pendiente'}.`}
      >
        <Icono
          nombre={hecho ? 'check-circle' : 'circle-outline'}
          color={hecho ? colores.primary : colores.outline}
        />
        <Texto variante="subtitulo">
          {letra}. {titulo}
        </Texto>
      </View>
      {children}
    </View>
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
