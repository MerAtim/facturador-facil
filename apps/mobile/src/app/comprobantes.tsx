import {
  formatearConSigno,
  type ComprobanteEmitido,
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

import { comprobantesEmitidos, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';
import { parametrosDe } from '../emision/claveDelComprobante';
import { resumenDelComprobante } from '../emision/resumenDelComprobante';

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

  // Los totales no dependen de la búsqueda ni del tope de la lista: son del período y la clase.
  const [totales, setTotales] = useState<TotalesDelPeriodo>();
  useEffect(() => {
    if (!configurada) return;
    let vigente = true;
    const hoy = FechaCalendario.enArgentina(new Date());
    comprobantesEmitidos
      .totales({
        ambiente: configurada.ambiente,
        emisor: configurada.emisor,
        ...fechasDe(periodo, hoy),
        ...(clase !== 'todas' && { clase }),
      })
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
  }, [configurada, periodo, clase]);

  const buscando = busqueda.trim() !== '';
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
        data={estado.paso === 'listo' ? estado.lista : []}
        keyExtractor={({ comprobante, puntoDeVenta, numero }) =>
          `${String(comprobante.datos.tipo.codigoArca)}.${String(puntoDeVenta)}.${String(numero)}`
        }
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
        renderItem={({ item }) => (
          <TarjetaDeComprobante
            {...resumenDelComprobante(item)}
            onPress={() => {
              router.push({
                pathname: '/comprobante',
                params: parametrosDe(item.comprobante.datos.tipo, item.puntoDeVenta, item.numero),
              });
            }}
          />
        )}
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
