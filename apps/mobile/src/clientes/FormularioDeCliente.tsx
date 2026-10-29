import {
  crearCliente,
  LARGO_MAXIMO_DEL_NOMBRE,
  type Cliente,
  type ProblemaDelCliente,
} from '@facturador/aplicacion';
import { CondicionIvaReceptor, LARGO_MAXIMO_DOMICILIO } from '@facturador/dominio';
import {
  Boton,
  CampoDeCuit,
  CampoDeTexto,
  cuitCompleto,
  Selector,
  Texto,
  useTema,
  type Opcion,
} from '@facturador/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { MENSAJE_DE_CUIT } from '../contribuyente/mensajesDeCuit';

const CONDICIONES: readonly Opcion<string>[] = CondicionIvaReceptor.TODAS.map((condicion) => ({
  valor: String(condicion.codigoArca),
  etiqueta: condicion.descripcion,
}));

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

/**
 * Los datos de un cliente, validados con los mismos value objects que usa la factura. El CUIT se
 * valida apenas se completa; editando un cliente no se puede cambiar, porque es lo que lo identifica.
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
  const [condicion, setCondicion] = useState(
    inicial?.condicion ?? CondicionIvaReceptor.RESPONSABLE_INSCRIPTO,
  );
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [domicilio, setDomicilio] = useState(inicial?.domicilio ?? '');

  const resultado = crearCliente({ cuit, condicion, nombre, domicilio });
  const problemas = resultado.ok ? [] : resultado.error;
  // El CUIT a medio escribir no es un error todavía.
  const errorDeCuit = cuitCompleto(cuit) ? mensajeDe(problemas, 'cuit') : undefined;

  return (
    <View style={{ gap: espacio.medio }}>
      {inicial ? (
        <Texto variante="cuerpo">CUIT {inicial.cuit.formateado()}</Texto>
      ) : (
        <CampoDeCuit
          valor={cuit}
          onCambiar={setCuit}
          error={errorDeCuit}
          valido={cuitCompleto(cuit) && errorDeCuit === undefined}
          autoFocus
        />
      )}
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
