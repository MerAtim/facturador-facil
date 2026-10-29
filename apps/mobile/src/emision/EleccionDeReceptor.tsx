import type { Cliente } from '@facturador/aplicacion';
import { CONSUMIDOR_FINAL_SIN_IDENTIFICAR, type Cuit, type Receptor } from '@facturador/dominio';
import { CampoDeTexto, Fichas, Texto, useTema, type Ficha } from '@facturador/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FilaDeCliente } from '../clientes/FilaDeCliente';
import { FormularioDeCliente } from '../clientes/FormularioDeCliente';
import { clientes } from '../composicion';

const CONSUMIDOR_FINAL = 'consumidor_final';
const BUSCAR = 'buscar';
const OTRO_CUIT = 'otro_cuit';

/** Los que entran cómodos como fichas; el resto se encuentra buscando. */
const FRECUENTES_A_LA_VISTA = 8;
const RESULTADOS_DE_LA_BUSQUEDA = 5;

type Modo = 'fichas' | typeof BUSCAR | typeof OTRO_CUIT;

const comoReceptor = ({ cuit, condicion, nombre, domicilio }: Cliente): Receptor => ({
  identificacion: { tipo: 'cuit', cuit },
  condicion,
  ...(nombre ? { nombre } : {}),
  ...(domicilio ? { domicilio } : {}),
});

const cuitDe = (receptor: Receptor): Cuit | undefined =>
  receptor.identificacion.tipo === 'cuit' ? receptor.identificacion.cuit : undefined;

/**
 * Elección del receptor con el menor esfuerzo: consumidor final y los clientes frecuentes están a
 * un toque, los demás se buscan, y un CUIT nuevo se carga ahí mismo y se valida apenas se completa.
 */
export function EleccionDeReceptor({
  receptor,
  onCambiar,
}: {
  readonly receptor: Receptor;
  readonly onCambiar: (receptor: Receptor) => void;
}) {
  const { espacio } = useTema();
  const [frecuentes, setFrecuentes] = useState<readonly Cliente[]>([]);
  const [modo, setModo] = useState<Modo>('fichas');

  useEffect(() => {
    clientes.frecuentes(FRECUENTES_A_LA_VISTA).then(setFrecuentes, () => undefined);
  }, []);

  const cuitElegido = cuitDe(receptor);
  // El elegido se ve aunque no esté entre los frecuentes, por ejemplo si salió de la búsqueda.
  const visibles =
    cuitElegido && !frecuentes.some((c) => c.cuit.esIgualA(cuitElegido))
      ? [{ cuit: cuitElegido, condicion: receptor.condicion, ...textosDe(receptor) }, ...frecuentes]
      : frecuentes;

  const fichas: readonly Ficha<string>[] = [
    { valor: CONSUMIDOR_FINAL, etiqueta: 'Consumidor final', icono: 'account' },
    ...visibles.map((c) => ({ valor: c.cuit.valor, etiqueta: c.nombre ?? c.cuit.formateado() })),
    { valor: BUSCAR, etiqueta: 'Buscar', icono: 'magnify' },
    { valor: OTRO_CUIT, etiqueta: 'Otro CUIT', icono: 'plus' },
  ];

  const usar = (cliente: Cliente) => {
    onCambiar(comoReceptor(cliente));
    setModo('fichas');
  };

  const elegir = (valor: string) => {
    if (valor === BUSCAR || valor === OTRO_CUIT) {
      setModo(valor);
      return;
    }
    setModo('fichas');
    if (valor === CONSUMIDOR_FINAL) onCambiar(CONSUMIDOR_FINAL_SIN_IDENTIFICAR);
    const elegido = visibles.find((c) => c.cuit.valor === valor);
    if (elegido) onCambiar(comoReceptor(elegido));
  };

  return (
    <View style={{ gap: espacio.medio }}>
      <Texto variante="subtitulo">Receptor</Texto>
      <Fichas
        opciones={fichas}
        valor={modo === 'fichas' ? (cuitElegido?.valor ?? CONSUMIDOR_FINAL) : modo}
        onCambiar={elegir}
      />
      {modo === BUSCAR && <BuscadorDeClientes onElegir={usar} />}
      {/* Un CUIT nuevo queda como cliente recién cuando ARCA autoriza una factura para él. */}
      {modo === OTRO_CUIT && (
        <FormularioDeCliente textoDelBoton="Usar este receptor" onListo={usar} />
      )}
      {modo === 'fichas' && cuitElegido && (
        <Texto variante="detalle">
          CUIT {cuitElegido.formateado()} · {receptor.condicion.descripcion}
        </Texto>
      )}
    </View>
  );
}

function textosDe({ nombre, domicilio }: Receptor) {
  return { ...(nombre ? { nombre } : {}), ...(domicilio ? { domicilio } : {}) };
}

function BuscadorDeClientes({ onElegir }: { readonly onElegir: (cliente: Cliente) => void }) {
  const { espacio } = useTema();
  const [texto, setTexto] = useState('');
  const [encontrados, setEncontrados] = useState<readonly Cliente[]>([]);

  useEffect(() => {
    // Si se sigue escribiendo antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true;
    clientes.buscar(texto, RESULTADOS_DE_LA_BUSQUEDA).then(
      (resultado) => {
        if (vigente) setEncontrados(resultado);
      },
      () => undefined,
    );
    return () => {
      vigente = false;
    };
  }, [texto]);

  return (
    <View style={{ gap: espacio.chico }}>
      <CampoDeTexto
        etiqueta="Nombre o CUIT del cliente"
        datoPersonal
        valor={texto}
        onCambiar={setTexto}
        maximo={60}
        autoFocus
      />
      {encontrados.map((cliente) => (
        <FilaDeCliente
          key={cliente.cuit.valor}
          cliente={cliente}
          onPress={() => {
            onElegir(cliente);
          }}
        />
      ))}
      {encontrados.length === 0 && (
        <Texto variante="detalle">
          {texto.trim() === ''
            ? 'Todavía no hay clientes guardados.'
            : 'No hay clientes que coincidan. Cargalo con "Otro CUIT".'}
        </Texto>
      )}
    </View>
  );
}
