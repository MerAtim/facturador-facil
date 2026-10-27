import type { Ambiente } from '@facturador/aplicacion';
import {
  Cuit,
  Emisor,
  FechaCalendario,
  LARGO_MAXIMO_DOMICILIO,
  LARGO_MAXIMO_RAZON_SOCIAL,
  validarDatosDelEmisor,
  type CondicionEmisor,
  type MotivoEmisorInvalido,
} from '@facturador/dominio';
import {
  Aviso,
  Boton,
  CampoDeCuit,
  CampoDeFecha,
  CampoDeTexto,
  DialogoDeConfirmacion,
  Pantalla,
  SelectorSegmentado,
  Texto,
  useTema,
  type Opcion,
} from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { repositorioDeConfiguracion } from '../configuracion/configuracion';
import { MENSAJE_DE_CUIT } from '../contribuyente/mensajesDeCuit';

const CONDICIONES: readonly Opcion<CondicionEmisor>[] = [
  { valor: 'monotributo', etiqueta: 'Monotributo' },
  { valor: 'responsable_inscripto', etiqueta: 'Inscripto' },
  { valor: 'exento', etiqueta: 'Exento' },
];

const AMBIENTES: readonly Opcion<Ambiente>[] = [
  { valor: 'homologacion', etiqueta: 'Homologación' },
  { valor: 'produccion', etiqueta: 'Producción' },
];

const MENSAJE_DEL_EMISOR: Readonly<Record<MotivoEmisorInvalido, string>> = {
  razon_social_vacia: 'Escribí tu nombre o razón social.',
  razon_social_larga: `Hasta ${String(LARGO_MAXIMO_RAZON_SOCIAL)} caracteres.`,
  domicilio_vacio: 'Escribí tu domicilio comercial.',
  domicilio_largo: `Hasta ${String(LARGO_MAXIMO_DOMICILIO)} caracteres.`,
  punto_de_venta_invalido: 'Un número del 1 al 99999.',
};

type CampoConError = 'razonSocial' | 'cuit' | 'domicilio' | 'inicio' | 'puntoDeVenta';
type Errores = Readonly<Partial<Record<CampoConError, string | undefined>>>;

export default function Configuracion() {
  const { espacio } = useTema();
  const router = useRouter();
  const [razonSocial, setRazonSocial] = useState('');
  const [cuit, setCuit] = useState('');
  const [condicion, setCondicion] = useState<CondicionEmisor>('monotributo');
  const [domicilio, setDomicilio] = useState('');
  const [inicio, setInicio] = useState<FechaCalendario>();
  const [puntoDeVenta, setPuntoDeVenta] = useState('');
  const [ambiente, setAmbiente] = useState<Ambiente>('homologacion');
  const [confirmandoProduccion, setConfirmandoProduccion] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    void repositorioDeConfiguracion.leer().then((guardada) => {
      if (!guardada) return;
      const { datos } = guardada.emisor;
      setRazonSocial(datos.razonSocial);
      setCuit(datos.cuit.formateado());
      setCondicion(datos.condicion);
      setDomicilio(datos.domicilio);
      setInicio(datos.inicioDeActividades);
      setPuntoDeVenta(String(datos.puntoDeVenta));
      setAmbiente(guardada.ambiente);
    });
  }, []);

  /** Al tocar un campo marcado, su error se va: el usuario lo está corrigiendo. */
  const corrigiendo =
    <T,>(campo: CampoConError, asignar: (valor: T) => void) =>
    (valor: T) => {
      asignar(valor);
      setErrores((actuales) => ({ ...actuales, [campo]: undefined }));
    };

  const elegirAmbiente = (elegido: Ambiente) => {
    // Pasar a producción emite comprobantes con validez fiscal: se confirma aparte.
    if (elegido === 'produccion') setConfirmandoProduccion(true);
    else setAmbiente(elegido);
  };

  const guardar = async () => {
    const cuitValido = Cuit.crear(cuit);
    const datos = {
      razonSocial,
      condicion,
      domicilio,
      puntoDeVenta: /^\d{1,5}$/.test(puntoDeVenta) ? Number(puntoDeVenta) : 0,
    };
    const encontrados = erroresDe(validarDatosDelEmisor(datos), cuitValido, inicio);
    const emisor =
      cuitValido.ok && inicio
        ? Emisor.crear({ ...datos, cuit: cuitValido.valor, inicioDeActividades: inicio })
        : undefined;

    if (!emisor?.ok) {
      setErrores(encontrados);
      return;
    }

    setErrores({});
    setFallo(false);
    setGuardando(true);
    try {
      await repositorioDeConfiguracion.guardar({ emisor: emisor.valor, ambiente });
      router.back();
    } catch {
      setFallo(true);
    } finally {
      setGuardando(false);
    }
  };

  const hoy = new Date();

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Datos del emisor' }} />
      <ScrollView
        contentContainerStyle={{ padding: espacio.normal, gap: espacio.medio }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Texto variante="detalle">
          Se imprimen en cada comprobante. Tienen que coincidir con los que figuran en ARCA.
        </Texto>
        <CampoDeTexto
          etiqueta="Nombre o razón social"
          valor={razonSocial}
          onCambiar={corrigiendo('razonSocial', setRazonSocial)}
          maximo={LARGO_MAXIMO_RAZON_SOCIAL}
          error={errores.razonSocial}
        />
        <CampoDeCuit valor={cuit} onCambiar={corrigiendo('cuit', setCuit)} error={errores.cuit} />
        <Texto variante="etiqueta">Condición frente al IVA</Texto>
        <SelectorSegmentado opciones={CONDICIONES} valor={condicion} onCambiar={setCondicion} />
        <CampoDeTexto
          etiqueta="Domicilio comercial"
          valor={domicilio}
          onCambiar={corrigiendo('domicilio', setDomicilio)}
          maximo={LARGO_MAXIMO_DOMICILIO}
          error={errores.domicilio}
        />
        <CampoDeFecha
          etiqueta="Inicio de actividades"
          texto={inicio?.formatear() ?? ''}
          valor={inicio ? new Date(inicio.anio, inicio.mes - 1, inicio.dia) : hoy}
          maxima={hoy}
          error={errores.inicio}
          onCambiar={(fecha) => {
            const elegida = FechaCalendario.crear(
              fecha.getFullYear(),
              fecha.getMonth() + 1,
              fecha.getDate(),
            );
            if (elegida.ok) corrigiendo('inicio', setInicio)(elegida.valor);
          }}
        />
        <CampoDeTexto
          etiqueta="Punto de venta"
          valor={puntoDeVenta}
          onCambiar={corrigiendo('puntoDeVenta', (texto: string) => {
            setPuntoDeVenta(texto.replace(/\D/g, '').slice(0, 5));
          })}
          numerico
          error={errores.puntoDeVenta}
        />
        <Texto variante="detalle">
          El punto de venta tiene que estar dado de alta en ARCA para factura electrónica por web
          service.
        </Texto>

        <Texto variante="etiqueta">Ambiente</Texto>
        <SelectorSegmentado opciones={AMBIENTES} valor={ambiente} onCambiar={elegirAmbiente} />
        <AvisoDeAmbiente ambiente={ambiente} />

        {fallo && (
          <Aviso icono="alert-circle-outline" tono="error">
            No se pudo guardar. Probá de nuevo.
          </Aviso>
        )}
        <Boton
          onPress={() => void guardar()}
          disabled={guardando}
          loading={guardando}
          style={{ marginTop: espacio.normal }}
        >
          Guardar
        </Boton>
      </ScrollView>

      <DialogoDeConfirmacion
        visible={confirmandoProduccion}
        titulo="¿Facturar en producción?"
        mensaje="Los comprobantes que emitas van a tener validez fiscal y no se pueden borrar."
        confirmar="Pasar a producción"
        onConfirmar={() => {
          setAmbiente('produccion');
          setConfirmandoProduccion(false);
        }}
        onCancelar={() => {
          setConfirmandoProduccion(false);
        }}
      />
    </Pantalla>
  );
}

function erroresDe(
  motivos: readonly MotivoEmisorInvalido[],
  cuit: ReturnType<typeof Cuit.crear>,
  inicio: FechaCalendario | undefined,
): Errores {
  const mensaje = (...posibles: readonly MotivoEmisorInvalido[]) => {
    const motivo = posibles.find((m) => motivos.includes(m));
    return motivo ? MENSAJE_DEL_EMISOR[motivo] : undefined;
  };
  const razonSocial = mensaje('razon_social_vacia', 'razon_social_larga');
  const domicilio = mensaje('domicilio_vacio', 'domicilio_largo');
  const puntoDeVenta = mensaje('punto_de_venta_invalido');

  return {
    ...(razonSocial ? { razonSocial } : {}),
    ...(domicilio ? { domicilio } : {}),
    ...(puntoDeVenta ? { puntoDeVenta } : {}),
    ...(cuit.ok ? {} : { cuit: MENSAJE_DE_CUIT[cuit.error.motivo] }),
    ...(inicio ? {} : { inicio: 'Elegí la fecha en que empezaste la actividad.' }),
  };
}
