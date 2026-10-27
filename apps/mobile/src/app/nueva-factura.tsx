import { crearPreferencias } from '@facturador/aplicacion';
import {
  AlicuotaIva,
  calcularTotales,
  Cantidad,
  claseParaEmitir,
  CondicionIvaReceptor,
  Dinero,
  TipoComprobante,
  type ClaseComprobante,
  type ModoDePrecio,
} from '@facturador/dominio';
import {
  CampoDeImporte,
  importeEscrito,
  Pantalla,
  ResumenDeTotales,
  Selector,
  SelectorSegmentado,
  Texto,
  useTema,
  type LineaDeTotal,
  type Opcion,
} from '@facturador/ui';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CONDICION_DEL_EMISOR } from '../configuracion/emisorProvisorio';
import { almacenLocalDelDispositivo } from '../infraestructura/almacenLocalDelDispositivo';

const preferencias = crearPreferencias(almacenLocalDelDispositivo);

const MODOS: readonly Opcion<ModoDePrecio>[] = [
  { valor: 'final', etiqueta: 'Precio final' },
  { valor: 'neto', etiqueta: 'Precio neto' },
];

const CONDICIONES: readonly Opcion<string>[] = CondicionIvaReceptor.TODAS.map((condicion) => ({
  valor: String(condicion.codigoArca),
  etiqueta: condicion.descripcion,
}));

const ALICUOTAS: readonly Opcion<string>[] = AlicuotaIva.TODAS.map((alicuota) => ({
  valor: String(alicuota.codigoArca),
  etiqueta: alicuota.formatear(),
}));

const EXPLICACION_DE_LA_CLASE: Readonly<Record<ClaseComprobante, string>> = {
  A: 'Discrimina el IVA: el receptor puede computarlo como crédito fiscal.',
  B: 'El IVA va incluido en el precio y el cliente no lo ve discriminado.',
  C: 'No lleva IVA.',
};

export default function NuevaFactura() {
  const { espacio } = useTema();
  const [receptor, setReceptor] = useState(CondicionIvaReceptor.CONSUMIDOR_FINAL);
  const [alicuota, setAlicuota] = useState(AlicuotaIva.VEINTIUNO);
  const [importe, setImporte] = useState('');
  const [modo, setModo] = useState<ModoDePrecio>();

  useEffect(() => {
    void preferencias.modoDePrecio().then((recordado) => {
      // Si el usuario ya eligió mientras se leía la preferencia, manda su elección.
      setModo((actual) => actual ?? recordado);
    });
  }, []);

  const modoDePrecio = modo ?? 'final';
  const tipo = TipoComprobante.de(claseParaEmitir(CONDICION_DEL_EMISOR, receptor), 'factura');
  const totales = calcularTotales({
    tipo,
    modoDePrecio,
    items: [
      { descripcion: '', cantidad: Cantidad.UNO, precioUnitario: leerImporte(importe), alicuota },
    ],
  });

  const lineas: readonly LineaDeTotal[] = tipo.informaIva()
    ? [
        { etiqueta: 'Neto', importe: totales.neto.formatear() },
        { etiqueta: `IVA ${alicuota.formatear()}`, importe: totales.iva.formatear() },
      ]
    : [];

  const elegirModo = (elegido: ModoDePrecio) => {
    setModo(elegido);
    void preferencias.recordarModoDePrecio(elegido);
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
          <Selector
            etiqueta="Condición frente al IVA del receptor"
            opciones={CONDICIONES}
            valor={String(receptor.codigoArca)}
            onCambiar={(codigo) => {
              setReceptor(CondicionIvaReceptor.desdeCodigoArca(Number(codigo)) ?? receptor);
            }}
          />
          <View accessible>
            <Texto variante="subtitulo">Factura {tipo.clase}</Texto>
            <Texto variante="detalle">{EXPLICACION_DE_LA_CLASE[tipo.clase]}</Texto>
          </View>
        </View>

        <View style={{ gap: espacio.medio }}>
          {tipo.informaIva() && (
            <SelectorSegmentado opciones={MODOS} valor={modoDePrecio} onCambiar={elegirModo} />
          )}
          <CampoDeImporte
            etiqueta={etiquetaDelImporte(tipo, modoDePrecio)}
            valor={importe}
            onCambiar={setImporte}
            autoFocus
          />
          {tipo.informaIva() && (
            <Selector
              etiqueta="Alícuota de IVA"
              opciones={ALICUOTAS}
              valor={String(alicuota.codigoArca)}
              onCambiar={(codigo) => {
                setAlicuota(AlicuotaIva.desdeCodigoArca(Number(codigo)) ?? alicuota);
              }}
            />
          )}
        </View>

        <ResumenDeTotales lineas={lineas} total={totales.total.formatear()} />
      </ScrollView>
    </Pantalla>
  );
}

/** Mientras el importe está vacío o a medio escribir, los totales muestran cero. */
function leerImporte(texto: string): Dinero {
  const resultado = Dinero.desdeTexto(importeEscrito(texto));
  return resultado.ok ? resultado.valor : Dinero.CERO;
}

function etiquetaDelImporte(tipo: TipoComprobante, modo: ModoDePrecio): string {
  if (!tipo.informaIva()) return 'Importe';
  return modo === 'final' ? 'Precio final, con IVA' : 'Precio neto, sin IVA';
}

const estilos = StyleSheet.create({
  contenido: { flexGrow: 1 },
});
