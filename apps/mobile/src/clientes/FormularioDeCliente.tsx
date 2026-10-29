import {
  crearCliente,
  LARGO_MAXIMO_DEL_NOMBRE,
  type Cliente,
  type ProblemaDelCliente,
} from '@facturador/aplicacion';
import { CondicionIvaReceptor, Cuit, LARGO_MAXIMO_DOMICILIO } from '@facturador/dominio';
import {
  Aviso,
  Boton,
  CampoDeCuit,
  CampoDeTexto,
  cuitCompleto,
  Selector,
  Texto,
  useTema,
  type Opcion,
} from '@facturador/ui';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { MENSAJE_DE_CUIT } from '../contribuyente/mensajesDeCuit';
import { usePadron, type ConsultaAlPadron } from './usePadron';

const CONDICIONES: readonly Opcion<string>[] = CondicionIvaReceptor.TODAS.map((condicion) => ({
  valor: String(condicion.codigoArca),
  etiqueta: condicion.descripcion,
}));

const CONDICION_POR_DEFECTO = CondicionIvaReceptor.RESPONSABLE_INSCRIPTO;

const mensajeDe = (problemas: readonly ProblemaDelCliente[], tipo: ProblemaDelCliente['tipo']) => {
  const problema = problemas.find((p) => p.tipo === tipo);
  if (!problema) return undefined;
  switch (problema.tipo) {
    case 'cuit':
      return MENSAJE_DE_CUIT[problema.motivo];
    case 'nombre_largo':
      return `Hasta ${String(LARGO_MAXIMO_DEL_NOMBRE)} caracteres.`;
    case 'domicilio_largo':
      return `Hasta ${String(LARGO_MAXIMO_DOMICILIO)} caracteres.`;
  }
};

const cuitConsultable = (texto: string) => {
  if (!cuitCompleto(texto)) return undefined;
  const cuit = Cuit.crear(texto);
  return cuit.ok ? cuit.valor : undefined;
};

/** Lo que puso el padrón en cada campo, para cambiarlo si cambia el CUIT sin pisar lo escrito. */
interface Puesto {
  readonly nombre?: string | undefined;
  readonly domicilio?: string | undefined;
}

/** Un campo vacío o con lo que puso ARCA antes toma el dato nuevo; lo escrito a mano se respeta. */
const completar = (actual: string, puestoAntes: string | undefined, deArca: string | undefined) =>
  actual.trim() === '' || actual === puestoAntes ? (deArca ?? '') : actual;

/**
 * Los datos de un cliente, validados con los mismos value objects que usa la factura. El CUIT se
 * valida apenas se completa; editando un cliente no se puede cambiar, porque es lo que lo identifica.
 * Con un CUIT nuevo se buscan sus datos en ARCA, sin frenar la carga a mano mientras tanto.
 */
export function FormularioDeCliente({
  inicial,
  textoDelBoton,
  onListo,
  ocupado = false,
}: {
  /** Con un cliente, se edita: el CUIT queda fijo. */
  readonly inicial?: Cliente;
  readonly textoDelBoton: string;
  readonly onListo: (cliente: Cliente) => void;
  readonly ocupado?: boolean;
}) {
  const { espacio } = useTema();
  const [cuit, setCuit] = useState(inicial?.cuit.formateado() ?? '');
  const [condicion, setCondicion] = useState(inicial?.condicion ?? CONDICION_POR_DEFECTO);
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [domicilio, setDomicilio] = useState(inicial?.domicilio ?? '');
  // La condición que elige el usuario manda sobre la de ARCA.
  const [condicionElegida, setCondicionElegida] = useState(inicial !== undefined);
  const puesto = useRef<Puesto>({});

  const padron = usePadron(inicial ? undefined : cuitConsultable(cuit));
  useEffect(() => {
    // Mientras se busca otro CUIT, o si no se encontró, lo que puso ARCA para el anterior se va.
    const datos = padron.estado === 'encontrado' ? padron.datos : undefined;
    const antes = puesto.current;
    setNombre((actual) => completar(actual, antes.nombre, datos?.nombre));
    setDomicilio((actual) => completar(actual, antes.domicilio, datos?.domicilio));
    if (!condicionElegida) setCondicion(datos?.condicion ?? CONDICION_POR_DEFECTO);
    puesto.current = { nombre: datos?.nombre, domicilio: datos?.domicilio };
    // Reacciona a cada respuesta del padrón, no a cada tecla.
  }, [padron]);

  const resultado = crearCliente({ cuit, condicion, nombre, domicilio });
  const problemas = resultado.ok ? [] : resultado.error;
  // El CUIT a medio escribir no es un error todavía.
  const errorDeCuit = cuitCompleto(cuit) ? mensajeDe(problemas, 'cuit') : undefined;

  return (
    <View style={{ gap: espacio.medio }}>
      {inicial ? (
        <Texto variante="cuerpo">CUIT {inicial.cuit.formateado()}</Texto>
      ) : (
        <View style={{ gap: espacio.chico }}>
          <CampoDeCuit
            valor={cuit}
            onCambiar={setCuit}
            error={errorDeCuit}
            valido={cuitCompleto(cuit) && errorDeCuit === undefined}
            autoFocus
          />
          <EstadoDelPadron consulta={padron} condicionElegida={condicionElegida} />
        </View>
      )}
      <Selector
        etiqueta="Condición frente al IVA"
        opciones={CONDICIONES}
        valor={String(condicion.codigoArca)}
        onCambiar={(codigo) => {
          setCondicion(CondicionIvaReceptor.desdeCodigoArca(Number(codigo)) ?? condicion);
          setCondicionElegida(true);
        }}
      />
      <CampoDeTexto
        etiqueta="Nombre o razón social (opcional)"
        datoPersonal
        valor={nombre}
        onCambiar={setNombre}
        maximo={LARGO_MAXIMO_DEL_NOMBRE}
        error={mensajeDe(problemas, 'nombre_largo')}
      />
      <CampoDeTexto
        etiqueta="Domicilio (lo pide la factura A)"
        datoPersonal
        valor={domicilio}
        onCambiar={setDomicilio}
        maximo={LARGO_MAXIMO_DOMICILIO}
        error={mensajeDe(problemas, 'domicilio_largo')}
      />
      <Boton
        variante="secundario"
        disabled={!resultado.ok || ocupado}
        loading={ocupado}
        onPress={() => {
          if (resultado.ok) onListo(resultado.valor);
        }}
      >
        {textoDelBoton}
      </Boton>
    </View>
  );
}

/** Una línea debajo del CUIT, que el lector de pantalla anuncia cuando cambia. */
function EstadoDelPadron({
  consulta,
  condicionElegida,
}: {
  readonly consulta: ConsultaAlPadron;
  readonly condicionElegida: boolean;
}) {
  switch (consulta.estado) {
    case 'inactiva':
      return null;
    case 'buscando':
      return <Linea>Buscando sus datos en ARCA…</Linea>;
    case 'falla':
      return <Linea>{consulta.mensaje}</Linea>;
    case 'encontrado': {
      const { activo, condicion } = consulta.datos;
      if (!activo) {
        return (
          <Aviso icono="alert-outline" tono="error">
            ARCA informa ese CUIT con la clave inactiva y puede rechazar las facturas a su nombre.
            Confirmalo con tu cliente.
          </Aviso>
        );
      }
      return (
        <Linea>
          {condicion || condicionElegida
            ? 'Completamos sus datos con lo que informa ARCA. Revisalos antes de seguir.'
            : 'Completamos sus datos con lo que informa ARCA, pero no dice su condición frente al ' +
              'IVA: elegila vos.'}
        </Linea>
      );
    }
  }
}

function Linea({ children }: { readonly children: string }) {
  return (
    <View accessibilityLiveRegion="polite">
      <Texto variante="detalle">{children}</Texto>
    </View>
  );
}
