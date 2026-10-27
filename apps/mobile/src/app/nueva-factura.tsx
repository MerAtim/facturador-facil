import {
  crearPreferencias,
  itemVacio,
  totalesDelBorrador,
  type BorradorDeItem,
} from '@facturador/aplicacion';
import {
  AlicuotaIva,
  claseParaEmitir,
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  TipoComprobante,
  type ClaseComprobante,
  type ModoDePrecio,
  type Totales,
} from '@facturador/dominio';
import {
  Boton,
  Pantalla,
  ResumenDeTotales,
  SelectorSegmentado,
  Texto,
  useTema,
  type LineaDeTotal,
  type Opcion,
} from '@facturador/ui';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CONDICION_DEL_EMISOR } from '../configuracion/emisorProvisorio';
import { EditorDeItem } from '../emision/EditorDeItem';
import { EleccionDeReceptor } from '../emision/EleccionDeReceptor';
import { almacenLocalDelDispositivo } from '../infraestructura/almacenLocalDelDispositivo';

const preferencias = crearPreferencias(almacenLocalDelDispositivo);

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
  const [receptor, setReceptor] = useState(CONSUMIDOR_FINAL_SIN_IDENTIFICAR);
  const [modo, setModo] = useState<ModoDePrecio>();
  const ultimaClave = useRef(0);
  const [items, setItems] = useState<readonly ItemEnPantalla[]>([
    { clave: 0, borrador: itemVacio(AlicuotaIva.VEINTIUNO) },
  ]);

  useEffect(() => {
    void preferencias.modoDePrecio().then((recordado) => {
      // Si el usuario ya eligió mientras se leía la preferencia, manda su elección.
      setModo((actual) => actual ?? recordado);
    });
  }, []);

  const modoDePrecio = modo ?? 'final';
  const tipo = TipoComprobante.de(
    claseParaEmitir(CONDICION_DEL_EMISOR, receptor.condicion),
    'factura',
  );
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

  const quitarItem = (clave: number) => {
    setItems((actuales) => actuales.filter((item) => item.clave !== clave));
  };

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: 'Nueva factura' }} />
      <ScrollView
        contentContainerStyle={[
          estilos.contenido,
          { padding: espacio.normal, gap: espacio.grande },
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ gap: espacio.chico }}>
          <EleccionDeReceptor receptor={receptor} onCambiar={setReceptor} />
          <View accessible>
            <Texto variante="subtitulo">Factura {tipo.clase}</Texto>
            <Texto variante="detalle">{EXPLICACION_DE_LA_CLASE[tipo.clase]}</Texto>
          </View>
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
        </View>

        <ResumenDeTotales
          lineas={lineasDelResumen(tipo, totales)}
          total={totales.total.formatear()}
        />
      </ScrollView>
    </Pantalla>
  );
}

function etiquetaDelPrecio(tipo: TipoComprobante, modo: ModoDePrecio): string {
  if (!tipo.informaIva()) return 'Precio';
  return modo === 'final' ? 'Precio final' : 'Precio neto';
}

/** Neto e IVA; con más de una alícuota, separados por alícuota. */
function lineasDelResumen(tipo: TipoComprobante, totales: Totales): readonly LineaDeTotal[] {
  if (!tipo.informaIva()) return [];

  const [unica, ...otras] = totales.porAlicuota;
  if (!unica || otras.length === 0) {
    return [
      { etiqueta: 'Neto', importe: totales.neto.formatear() },
      {
        etiqueta: unica ? `IVA ${unica.alicuota.formatear()}` : 'IVA',
        importe: totales.iva.formatear(),
      },
    ];
  }

  return totales.porAlicuota.flatMap(({ alicuota, neto, iva }) => [
    { etiqueta: `Neto al ${alicuota.formatear()}`, importe: neto.formatear() },
    { etiqueta: `IVA ${alicuota.formatear()}`, importe: iva.formatear() },
  ]);
}

const estilos = StyleSheet.create({
  contenido: { flexGrow: 1 },
});
