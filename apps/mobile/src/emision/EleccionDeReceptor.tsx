import { crearReceptoresFrecuentes, type ReceptorConCuit } from '@facturador/aplicacion';
import {
  CONSUMIDOR_FINAL_SIN_IDENTIFICAR,
  CondicionIvaReceptor,
  Cuit,
  type Receptor,
} from '@facturador/dominio';
import {
  Boton,
  CampoDeCuit,
  CampoDeTexto,
  cuitCompleto,
  Fichas,
  Selector,
  Texto,
  useTema,
  type Ficha,
  type Opcion,
} from '@facturador/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { MENSAJE_DE_CUIT } from '../contribuyente/mensajesDeCuit';
import { almacenSeguroDelDispositivo } from '../infraestructura/almacenSeguroDelDispositivo';

const frecuentes = crearReceptoresFrecuentes(almacenSeguroDelDispositivo);

const CONSUMIDOR_FINAL = 'consumidor_final';
const OTRO_CUIT = 'otro_cuit';

const CONDICIONES: readonly Opcion<string>[] = CondicionIvaReceptor.TODAS.map((condicion) => ({
  valor: String(condicion.codigoArca),
  etiqueta: condicion.descripcion,
}));

const conCuit = ({ cuit, condicion, nombre }: ReceptorConCuit): Receptor => ({
  identificacion: { tipo: 'cuit', cuit },
  condicion,
  ...(nombre ? { nombre } : {}),
});

const cuitDe = (receptor: Receptor): Cuit | undefined =>
  receptor.identificacion.tipo === 'cuit' ? receptor.identificacion.cuit : undefined;

/**
 * Elección del receptor con el menor esfuerzo: consumidor final y los receptores frecuentes están
 * a un toque; un CUIT nuevo se carga ahí mismo y se valida apenas se completa.
 */
export function EleccionDeReceptor({
  receptor,
  onCambiar,
}: {
  readonly receptor: Receptor;
  readonly onCambiar: (receptor: Receptor) => void;
}) {
  const { espacio } = useTema();
  const [recordados, setRecordados] = useState<readonly ReceptorConCuit[]>([]);
  const [cargandoOtro, setCargandoOtro] = useState(false);

  useEffect(() => {
    void frecuentes.listar().then(setRecordados);
  }, []);

  const cuitElegido = cuitDe(receptor);
  // Si el receptor elegido no quedó entre los frecuentes (por ejemplo, el almacén falló), igual se ve.
  const visibles =
    cuitElegido && !recordados.some((r) => r.cuit.esIgualA(cuitElegido))
      ? [{ cuit: cuitElegido, condicion: receptor.condicion, ...nombreDe(receptor) }, ...recordados]
      : recordados;

  const fichas: readonly Ficha<string>[] = [
    { valor: CONSUMIDOR_FINAL, etiqueta: 'Consumidor final', icono: 'account' },
    ...visibles.map((r) => ({ valor: r.cuit.valor, etiqueta: r.nombre ?? r.cuit.formateado() })),
    { valor: OTRO_CUIT, etiqueta: 'Otro CUIT', icono: 'plus' },
  ];

  const elegir = (valor: string) => {
    setCargandoOtro(valor === OTRO_CUIT);
    if (valor === CONSUMIDOR_FINAL) onCambiar(CONSUMIDOR_FINAL_SIN_IDENTIFICAR);
    const recordado = visibles.find((r) => r.cuit.valor === valor);
    if (recordado) onCambiar(conCuit(recordado));
  };

  const usarNuevo = async (nuevo: ReceptorConCuit) => {
    onCambiar(conCuit(nuevo));
    setCargandoOtro(false);
    // Por ahora cuenta como uso elegirlo; cuando se emita desde acá, contará al obtener el CAE.
    await frecuentes.registrarUso(nuevo);
    setRecordados(await frecuentes.listar());
  };

  return (
    <View style={{ gap: espacio.medio }}>
      <Texto variante="subtitulo">Receptor</Texto>
      <Fichas
        opciones={fichas}
        valor={cargandoOtro ? OTRO_CUIT : (cuitElegido?.valor ?? CONSUMIDOR_FINAL)}
        onCambiar={elegir}
      />
      {cargandoOtro ? (
        <FormularioDeCuit onListo={(nuevo) => void usarNuevo(nuevo)} />
      ) : (
        cuitElegido && (
          <Texto variante="detalle">
            CUIT {cuitElegido.formateado()} · {receptor.condicion.descripcion}
          </Texto>
        )
      )}
    </View>
  );
}

function nombreDe(receptor: Receptor): { readonly nombre?: string } {
  return receptor.nombre ? { nombre: receptor.nombre } : {};
}

function FormularioDeCuit({ onListo }: { readonly onListo: (receptor: ReceptorConCuit) => void }) {
  const { espacio } = useTema();
  const [texto, setTexto] = useState('');
  const [condicion, setCondicion] = useState(CondicionIvaReceptor.RESPONSABLE_INSCRIPTO);
  const [nombre, setNombre] = useState('');

  const resultado = cuitCompleto(texto) ? Cuit.crear(texto) : undefined;
  const cuit = resultado?.ok ? resultado.valor : undefined;
  const error = resultado && !resultado.ok ? MENSAJE_DE_CUIT[resultado.error.motivo] : undefined;

  return (
    <View style={{ gap: espacio.medio }}>
      <CampoDeCuit
        valor={texto}
        onCambiar={setTexto}
        error={error}
        valido={cuit !== undefined}
        autoFocus
      />
      <Selector
        etiqueta="Condición frente al IVA"
        opciones={CONDICIONES}
        valor={String(condicion.codigoArca)}
        onCambiar={(codigo) => {
          setCondicion(CondicionIvaReceptor.desdeCodigoArca(Number(codigo)) ?? condicion);
        }}
      />
      <CampoDeTexto
        etiqueta="Nombre o razón social (opcional)"
        valor={nombre}
        onCambiar={setNombre}
        maximo={60}
      />
      <Boton
        variante="secundario"
        disabled={!cuit}
        onPress={() => {
          if (cuit)
            onListo({ cuit, condicion, ...(nombre.trim() ? { nombre: nombre.trim() } : {}) });
        }}
      >
        Usar este receptor
      </Boton>
    </View>
  );
}
