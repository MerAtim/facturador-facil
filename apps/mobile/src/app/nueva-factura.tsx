import {
  ajustarAlRango,
  itemVacio,
  prepararFactura,
  rangoDeFechaDeEmision,
  totalesDelBorrador,
  type ProblemaDeLaFactura,
  type BorradorDeItem,
  itemDelProducto,
  type Producto,
} from '@facturador/aplicacion';
import {
  AlicuotaIva,
  claseParaEmitir,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  FechaCalendario,
  TipoComprobante,
  type ClaseComprobante,
  type ModoDePrecio,
} from '@facturador/dominio';
import {
  Aviso,
  Boton,
  Cargando,
  Pantalla,
  ResumenDeTotales,
  SelectorSegmentado,
  Texto,
  useTema,
  type Opcion,
} from '@facturador/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CatalogoEnLaFactura } from '../catalogo/CatalogoEnLaFactura';
import { comprobantesEmitidos, preferencias, productos } from '../composicion';
import { AvisoDeAmbiente } from '../configuracion/AvisoDeAmbiente';
import { useConfiguracion } from '../configuracion/configuracion';
import { EditorDeItem } from '../emision/EditorDeItem';
import { EleccionDeReceptor } from '../emision/EleccionDeReceptor';
import { facturaEnCurso } from '../emision/facturaEnCurso';
import { explicarRango, FechaDeEmision } from '../emision/FechaDeEmision';
import { explicarProblema, lineasDelResumen } from '../emision/resumen';

const MODOS: readonly Opcion<ModoDePrecio>[] = [
  { valor: 'final', etiqueta: 'Precio final' },
  { valor: 'neto', etiqueta: 'Precio neto' },
];

const EXPLICACION_DE_LA_CLASE: Readonly<Record<ClaseComprobante, string>> = {
  A: 'Discrimina el IVA: el receptor puede computarlo como crédito fiscal.',
  B: 'El IVA va incluido en el precio y el cliente no lo ve discriminado.',
  C: 'No lleva IVA.',
};

interface ItemEnPantalla {
  /** Identifica al ítem aunque cambie de lugar al quitar otro. */
  readonly clave: number;
  readonly borrador: BorradorDeItem;
}

export default function NuevaFactura() {
  const { espacio } = useTema();
  const router = useRouter();
  const configuracion = useConfiguracion();
  const [receptor, setReceptor] = useState(CONSUMIDOR_FINAL_SIN_IDENTIFICAR);
  const [modo, setModo] = useState<ModoDePrecio>();
  const ultimaClave = useRef(0);
  const [items, setItems] = useState<readonly ItemEnPantalla[]>([
    { clave: 0, borrador: itemVacio(AlicuotaIva.VEINTIUNO) },
  ]);
  const [problemas, setProblemas] = useState<readonly ProblemaDeLaFactura[]>([]);

  useEffect(() => {
    void preferencias.modoDePrecio().then((recordado) => {
      // Si el usuario ya eligió mientras se leía la preferencia, manda su elección.
      setModo((actual) => actual ?? recordado);
    });
  }, []);

  const configurada = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  // Mientras se lee la configuración se calcula como monotributo; la pantalla todavía no se muestra.
  const condicionDelEmisor = configurada?.emisor.datos.condicion ?? 'monotributo';
  const modoDePrecio = modo ?? 'final';
  const tipo = TipoComprobante.de(
    claseParaEmitir(condicionDelEmisor, receptor.condicion),
    'factura',
  );
  // La fecha: sin elegir, la de hoy. El rango depende del último comprobante de este tipo.
  const hoy = FechaCalendario.enArgentina(new Date());
  const [elegida, setElegida] = useState<FechaCalendario>();
  const [ajuste, setAjuste] = useState<string>();
  const [ultimaFecha, setUltimaFecha] = useState<FechaCalendario>();
  const puntoDeVenta = configurada?.emisor.datos.puntoDeVenta ?? 0;
  useEffect(() => {
    if (!configurada) return;
    let vigente = true;
    void comprobantesEmitidos
      .ultimaFecha({
        ambiente: configurada.ambiente,
        emisor: configurada.emisor,
        tipo,
        puntoDeVenta: configurada.emisor.datos.puntoDeVenta,
      })
      // Sin poder leerla, ARCA igual valida el orden al emitir.
      .catch(() => undefined)
      .then((leida) => {
        if (vigente) setUltimaFecha(leida);
      });
    return () => {
      vigente = false;
    };
  }, [configurada, tipo.codigoArca]);
  const rango = rangoDeFechaDeEmision({ hoy, concepto: 'productos', ultimaFecha });
  const fechaDeEmision = elegida ?? hoy;

  // Al cambiar el tipo, la fecha elegida puede quedar antes de la última de ese tipo.
  useEffect(() => {
    if (!elegida) return;
    const ajustada = ajustarAlRango(elegida, rango);
    if (ajustada.esIgualA(elegida)) return;
    setElegida(ajustada.esIgualA(hoy) ? undefined : ajustada);
    setAjuste(
      `La última ${tipo.descripcion} es del ${ajustada.formatear()}: cambiamos la fecha a esa.`,
    );
  }, [ultimaFecha]);

  const totales = totalesDelBorrador(
    tipo,
    modoDePrecio,
    items.map((item) => item.borrador),
  );

  const elegirModo = (elegido: ModoDePrecio) => {
    setModo(elegido);
    void preferencias.recordarModoDePrecio(elegido);
  };

  const cambiarItem = (clave: number, borrador: BorradorDeItem) => {
    setItems((actuales) =>
      actuales.map((item) => (item.clave === clave ? { clave, borrador } : item)),
    );
  };

  const agregarItem = () => {
    ultimaClave.current += 1;
    const clave = ultimaClave.current;
    // El nuevo ítem hereda la alícuota del anterior: lo habitual es repetirla.
    setItems((actuales) => [
      ...actuales,
      { clave, borrador: itemVacio(actuales.at(-1)?.borrador.alicuota ?? AlicuotaIva.VEINTIUNO) },
    ]);
  };

  /** Un producto del catálogo completa el ítem vacío, si lo hay, o agrega uno nuevo. */
  const agregarDelCatalogo = (producto: Producto) => {
    setItems((actuales) => {
      const ultimo = actuales.at(-1);
      const borrador = itemDelProducto(producto, {
        modo: modoDePrecio,
        informaIva: tipo.informaIva(),
        alicuotaPorDefecto: ultimo?.borrador.alicuota ?? AlicuotaIva.VEINTIUNO,
      });
      if (ultimo?.borrador.descripcion.trim() === '' && ultimo.borrador.precio === '') {
        return [...actuales.slice(0, -1), { clave: ultimo.clave, borrador }];
      }
      ultimaClave.current += 1;
      return [...actuales, { clave: ultimaClave.current, borrador }];
    });
    // Que suba en el catálogo es un extra: si falla, el ítem igual se agregó.
    if (producto.id !== undefined) productos.registrarUso(producto.id).catch(() => undefined);
  };

  const quitarItem = (clave: number) => {
    setItems((actuales) => actuales.filter((item) => item.clave !== clave));
  };

  const revisar = () => {
    const preparada = prepararFactura({
      tipo,
      receptor,
      modoDePrecio,
      items: items.map((item) => item.borrador),
      hoy,
      fechaDeEmision,
      ultimaFecha,
    });
    if (!preparada.ok) {
      setProblemas(preparada.error);
      return;
    }
    setProblemas([]);
    facturaEnCurso.preparar(preparada.valor, receptor);
    router.push('/confirmar-factura');
  };

  if (configuracion.estado === 'lista' && !configurada) return <Redirect href="/configuracion" />;

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Nueva factura' }} />
      {configuracion.estado === 'cargando' && <Cargando />}
      {configurada && (
        <ScrollView
          contentContainerStyle={[
            estilos.contenido,
            { padding: espacio.normal, gap: espacio.grande },
          ]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <AvisoDeAmbiente ambiente={configurada.ambiente} />
          <View style={{ gap: espacio.chico }}>
            <EleccionDeReceptor receptor={receptor} onCambiar={setReceptor} />
            <View accessible>
              <Texto variante="subtitulo">Factura {tipo.clase}</Texto>
              <Texto variante="detalle">{EXPLICACION_DE_LA_CLASE[tipo.clase]}</Texto>
            </View>
            <FechaDeEmision
              fecha={fechaDeEmision}
              hoy={hoy}
              rango={rango}
              explicacion={explicarRango(rango, hoy, tipo, puntoDeVenta)}
              ajuste={ajuste}
              onCambiar={(nueva) => {
                setElegida(nueva.esIgualA(hoy) ? undefined : nueva);
                setAjuste(undefined);
              }}
            />
          </View>

          <View style={{ gap: espacio.medio }}>
            {tipo.informaIva() && (
              <SelectorSegmentado opciones={MODOS} valor={modoDePrecio} onCambiar={elegirModo} />
            )}
            {items.map((item, indice) => (
              <EditorDeItem
                key={item.clave}
                numero={indice + 1}
                borrador={item.borrador}
                onCambiar={(borrador) => {
                  cambiarItem(item.clave, borrador);
                }}
                onQuitar={
                  items.length > 1
                    ? () => {
                        quitarItem(item.clave);
                      }
                    : undefined
                }
                conAlicuota={tipo.informaIva()}
                etiquetaDelPrecio={etiquetaDelPrecio(tipo, modoDePrecio)}
                enfocarAlAbrir={item.clave === 0 ? 'precio' : 'descripcion'}
              />
            ))}
            <Boton variante="texto" icon="plus" onPress={agregarItem}>
              Agregar ítem
            </Boton>
            <CatalogoEnLaFactura conIva={tipo.informaIva()} onElegir={agregarDelCatalogo} />
          </View>

          <ResumenDeTotales
            lineas={lineasDelResumen(tipo, totales)}
            total={totales.total.formatear()}
          />

          {problemas.length > 0 && (
            <Aviso icono="alert-circle-outline" tono="error">
              {problemas.map(explicarProblema).join('\n')}
            </Aviso>
          )}
          <Boton icon="file-document-check-outline" onPress={revisar}>
            Revisar factura
          </Boton>
        </ScrollView>
      )}
    </Pantalla>
  );
}

function etiquetaDelPrecio(tipo: TipoComprobante, modo: ModoDePrecio): string {
  if (!tipo.informaIva()) return 'Precio';
  return modo === 'final' ? 'Precio final' : 'Precio neto';
}

const estilos = StyleSheet.create({
  contenido: { flexGrow: 1 },
});
