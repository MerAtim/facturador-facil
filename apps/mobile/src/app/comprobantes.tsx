import {
  formatearConSigno,
  type ComprobanteEmitido,
  type EmitidoEnOtroDispositivo,
  type TotalesDelPeriodo,
} from '@facturador/aplicacion';
import { clasesQuePuedeEmitir, FechaCalendario, type ClaseComprobante } from '@facturador/dominio';
import {
  Aviso,
  Boton,
  CampoDeTexto,
  Fichas,
  Pantalla,
  Tarjeta,
  TarjetaDeComprobante,
  Texto,
  useTema,
} from '@facturador/ui';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import {
  comprobantesEmitidos,
  deOtrosDispositivos,
  registro,
  traerDeOtrosDispositivosDe,
} from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
import { parametrosDe } from '../emision/claveDelComprobante';
import { resumenDeOtroDispositivo, resumenDelComprobante } from '../emision/resumenDelComprobante';

/** En la lista conviven los propios, completos, y los que se trajeron de ARCA de otros dispositivos. */
type EnLaLista =
  | { readonly origen: 'propio'; readonly comprobante: ComprobanteEmitido }
  | { readonly origen: 'otro'; readonly comprobante: EmitidoEnOtroDispositivo };

const fechaDe = (item: EnLaLista) =>
  item.origen === 'propio'
    ? item.comprobante.comprobante.datos.fechaDeEmision
    : item.comprobante.fechaDeEmision;

const claveDe = (item: EnLaLista) => {
  const { puntoDeVenta, numero } = item.comprobante;
  const tipo =
    item.origen === 'propio' ? item.comprobante.comprobante.datos.tipo : item.comprobante.tipo;
  return `${String(tipo.codigoArca)}.${String(puntoDeVenta)}.${String(numero)}`;
};

const sumar = (a: TotalesDelPeriodo, b: TotalesDelPeriodo): TotalesDelPeriodo => ({
  cantidad: a.cantidad + b.cantidad,
  totalEnCentavos: a.totalEnCentavos + b.totalEnCentavos,
  netoEnCentavos: a.netoEnCentavos + b.netoEnCentavos,
  ivaEnCentavos: a.ivaEnCentavos + b.ivaEnCentavos,
});

type Periodo = 'todo' | 'este_mes' | 'mes_anterior' | 'este_anio';

const PERIODOS: readonly { readonly valor: Periodo; readonly etiqueta: string }[] = [
  { valor: 'todo', etiqueta: 'Todos' },
  { valor: 'este_mes', etiqueta: 'Este mes' },
  { valor: 'mes_anterior', etiqueta: 'Mes anterior' },
  { valor: 'este_anio', etiqueta: 'Este año' },
];

const DE_A_TANDAS = 50;
/** Lo que se espera después de la última tecla antes de buscar. */
const ESPERA_AL_ESCRIBIR_MS = 300;

/** Las fechas de un período, contadas en Argentina. Ambos extremos incluidos. */
function fechasDe(periodo: Periodo, hoy: FechaCalendario) {
  const primeroDelMes = FechaCalendario.crear(hoy.anio, hoy.mes, 1);
  if (!primeroDelMes.ok) return {};
  switch (periodo) {
    case 'todo':
      return {};
    case 'este_mes':
      return { desde: primeroDelMes.valor, hasta: hoy };
    case 'mes_anterior': {
      const ultimoDelAnterior = primeroDelMes.valor.sumarDias(-1);
      const primeroDelAnterior = FechaCalendario.crear(
        ultimoDelAnterior.anio,
        ultimoDelAnterior.mes,
        1,
      );
      return primeroDelAnterior.ok
        ? { desde: primeroDelAnterior.valor, hasta: ultimoDelAnterior }
        : {};
    }
    case 'este_anio': {
      const primeroDelAnio = FechaCalendario.crear(hoy.anio, 1, 1);
      return primeroDelAnio.ok ? { desde: primeroDelAnio.valor, hasta: hoy } : {};
    }
  }
}

type Estado =
  | { readonly paso: 'cargando' }
  | { readonly paso: 'listo'; readonly lista: readonly ComprobanteEmitido[] }
  | { readonly paso: 'fallo' };

/** Los comprobantes emitidos, para encontrar uno y volver a compartirlo. */
export default function Comprobantes() {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('todo');
  const [clase, setClase] = useState<ClaseComprobante | 'todas'>('todas');
  const [limite, setLimite] = useState(DE_A_TANDAS);
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const clases = configurada ? clasesQuePuedeEmitir(configurada.emisor.datos.condicion) : [];

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(texto);
    }, ESPERA_AL_ESCRIBIR_MS);
    return () => {
      clearTimeout(espera);
    };
  }, [texto]);

  useEffect(() => {
    if (!configurada) return;
    // Si cambia el filtro antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true;
    const hoy = FechaCalendario.enArgentina(new Date());
    comprobantesEmitidos
      .listar({
        ambiente: configurada.ambiente,
        emisor: configurada.emisor,
        limite,
        busqueda,
        ...fechasDe(periodo, hoy),
        ...(clase !== 'todas' && { clase }),
      })
      .then(
        (lista) => {
          if (vigente) setEstado({ paso: 'listo', lista });
        },
        (error: unknown) => {
          registro.error('no se pudieron leer los comprobantes', error);
          if (vigente) setEstado({ paso: 'fallo' });
        },
      );
    return () => {
      vigente = false;
    };
  }, [configurada, busqueda, periodo, clase, limite]);

  // Lo facturado desde otros dispositivos lo tiene ARCA: al abrir se traen los nuevos. Sin
  // conexión o sin certificado se muestra lo que ya se tenía.
  const [traidos, setTraidos] = useState(0);
  useEffect(() => {
    if (!configurada) return;
    let vigente = true;
    traerDeOtrosDispositivosDe(configurada).then(
      (cantidad) => {
        if (vigente && cantidad) setTraidos((anteriores) => anteriores + cantidad);
      },
      (error: unknown) => {
        registro.error('no se pudieron traer los comprobantes de otros dispositivos', error);
      },
    );
    return () => {
      vigente = false;
    };
  }, [configurada]);

  const buscando = busqueda.trim() !== '';
  // La búsqueda mira los propios, que tienen el nombre del receptor y los ítems.
  const [deOtros, setDeOtros] = useState<readonly EmitidoEnOtroDispositivo[]>([]);
  useEffect(() => {
    if (!configurada || buscando) {
      setDeOtros([]);
      return;
    }
    let vigente = true;
    const hoy = FechaCalendario.enArgentina(new Date());
    deOtrosDispositivos
      .listar({
        ambiente: configurada.ambiente,
        emisor: configurada.emisor,
        ...fechasDe(periodo, hoy),
        ...(clase !== 'todas' && { clase }),
      })
      .then(
        (lista) => {
          if (vigente) setDeOtros(lista);
        },
        (error: unknown) => {
          registro.error('no se pudieron leer los comprobantes de otros dispositivos', error);
        },
      );
    return () => {
      vigente = false;
    };
  }, [configurada, buscando, periodo, clase, traidos]);

  // Los totales no dependen de la búsqueda ni del tope de la lista: son del período y la clase.
  const [totales, setTotales] = useState<TotalesDelPeriodo>();
  useEffect(() => {
    if (!configurada) return;
    let vigente = true;
    const hoy = FechaCalendario.enArgentina(new Date());
    const filtro = {
      ambiente: configurada.ambiente,
      emisor: configurada.emisor,
      ...fechasDe(periodo, hoy),
      ...(clase !== 'todas' && { clase }),
    };
    Promise.all([comprobantesEmitidos.totales(filtro), deOtrosDispositivos.totales(filtro)])
      .then(([propios, otros]) => sumar(propios, otros))
      .then(
        (leidos) => {
          if (vigente) setTotales(leidos);
        },
        (error: unknown) => {
          registro.error('no se pudieron calcular los totales', error);
          if (vigente) setTotales(undefined);
        },
      );
    return () => {
      vigente = false;
    };
  }, [configurada, periodo, clase, traidos]);

  const propios = estado.paso === 'listo' ? estado.lista : [];
  // Los de otros dispositivos se intercalan por fecha, hasta donde llega la tanda de los propios.
  const masViejo = propios.length === limite ? propios.at(-1) : undefined;
  const enLaLista: readonly EnLaLista[] = [
    ...propios.map((comprobante) => ({ origen: 'propio' as const, comprobante })),
    ...deOtros
      .filter(
        (otro) =>
          !masViejo || !otro.fechaDeEmision.esAnteriorA(masViejo.comprobante.datos.fechaDeEmision),
      )
      .map((comprobante) => ({ origen: 'otro' as const, comprobante })),
  ].sort((a, b) => fechaDe(b).diasHasta(fechaDe(a)));
  const filtrando = buscando || periodo !== 'todo' || clase !== 'todas';
  const conIva = configurada?.emisor.datos.condicion === 'responsable_inscripto';
  const nombreDelFiltro = [
    PERIODOS.find(({ valor }) => valor === periodo)?.etiqueta ?? '',
    clases.length > 1 ? (clase === 'todas' ? 'todas las clases' : `clase ${clase}`) : undefined,
  ]
    .filter((parte) => parte !== undefined)
    .join(' · ');

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Comprobantes' }} />
      <FlatList
        data={enLaLista}
        keyExtractor={claveDe}
        contentContainerStyle={{ padding: espacio.normal, gap: espacio.medio }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: espacio.medio }}>
            <CampoDeTexto
              etiqueta="Buscar por cliente, CUIT, número o importe"
              datoPersonal
              valor={texto}
              onCambiar={(nuevo) => {
                setTexto(nuevo);
                setLimite(DE_A_TANDAS);
              }}
              maximo={60}
            />
            <Fichas
              opciones={PERIODOS}
              valor={periodo}
              onCambiar={(nuevo) => {
                setPeriodo(nuevo);
                setLimite(DE_A_TANDAS);
              }}
            />
            {clases.length > 1 && (
              <Fichas
                opciones={[
                  { valor: 'todas' as const, etiqueta: 'Todas las clases' },
                  ...clases.map((c) => ({ valor: c, etiqueta: `Clase ${c}` })),
                ]}
                valor={clase}
                onCambiar={(nueva) => {
                  setClase(nueva);
                  setLimite(DE_A_TANDAS);
                }}
              />
            )}
            {/* Con una búsqueda, la lista ya no es todo el período y el total confundiría. */}
            {!buscando && totales && totales.cantidad > 0 && (
              <ResumenDelPeriodo filtro={nombreDelFiltro} totales={totales} conIva={conIva} />
            )}
            {estado.paso === 'fallo' && (
              <Aviso icono="alert-circle-outline" tono="error">
                No se pudieron leer los comprobantes. Volvé a abrir la pantalla.
              </Aviso>
            )}
          </View>
        }
        renderItem={({ item }) =>
          item.origen === 'propio' ? (
            <TarjetaDeComprobante
              {...resumenDelComprobante(item.comprobante)}
              onPress={() => {
                const { comprobante, puntoDeVenta, numero } = item.comprobante;
                router.push({
                  pathname: '/comprobante',
                  params: parametrosDe(comprobante.datos.tipo, puntoDeVenta, numero),
                });
              }}
            />
          ) : (
            <TarjetaDeComprobante
              {...resumenDeOtroDispositivo(item.comprobante)}
              onPress={() => {
                const { tipo, puntoDeVenta, numero } = item.comprobante;
                router.push({
                  pathname: '/comprobante-de-otro-dispositivo',
                  params: parametrosDe(tipo, puntoDeVenta, numero),
                });
              }}
            />
          )
        }
        ListEmptyComponent={
          estado.paso === 'listo' ? (
            <Texto variante="cuerpo">
              {filtrando
                ? 'No hay comprobantes que coincidan.'
                : 'Todavía no emitiste comprobantes desde este teléfono.'}
            </Texto>
          ) : undefined
        }
        ListFooterComponent={
          estado.paso === 'listo' && estado.lista.length === limite ? (
            <Boton
              variante="texto"
              onPress={() => {
                setLimite((actual) => actual + DE_A_TANDAS);
              }}
            >
              Mostrar más
            </Boton>
          ) : undefined
        }
      />
    </Pantalla>
  );
}

/** Cuánto se facturó con el filtro elegido, ya descontadas las notas de crédito. */
function ResumenDelPeriodo({
  filtro,
  totales,
  conIva,
}: {
  readonly filtro: string;
  readonly totales: TotalesDelPeriodo;
  readonly conIva: boolean;
}) {
  const { colores } = useTema();
  const total = formatearConSigno(totales.totalEnCentavos);
  const cantidad =
    totales.cantidad === 1 ? '1 comprobante' : `${String(totales.cantidad)} comprobantes`;
  const desglose = conIva
    ? `Neto ${formatearConSigno(totales.netoEnCentavos)} · IVA ${formatearConSigno(totales.ivaEnCentavos)}`
    : undefined;
  return (
    <View
      accessible
      accessibilityLabel={`${filtro}: facturaste ${total} en ${cantidad}.${desglose ? ` ${desglose}.` : ''}`}
    >
      <Tarjeta>
        <View style={estilos.resumen}>
          <Texto variante="detalle" style={{ color: colores.onSurfaceVariant }}>
            {filtro}
          </Texto>
          <Texto variante="importeDestacado" style={{ color: colores.primary }}>
            {total}
          </Texto>
          <Texto variante="detalle" style={{ color: colores.onSurfaceVariant }}>
            {desglose ? `${cantidad} · ${desglose}` : cantidad}
          </Texto>
        </View>
      </Tarjeta>
    </View>
  );
}

const estilos = StyleSheet.create({
  resumen: { gap: 2 },
});
