import type { Cliente } from '@facturador/aplicacion';
import { Cuit } from '@facturador/dominio';
import { Aviso, Boton, DialogoDeConfirmacion, Pantalla, useTema } from '@facturador/ui';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { FormularioDeCliente } from '../clientes/FormularioDeCliente';
import { clientes, registro } from '../composicion';

type Estado =
  | { readonly paso: 'cargando' }
  | { readonly paso: 'listo'; readonly cliente?: Cliente }
  | { readonly paso: 'no_encontrado' };

/** Alta de un cliente o, si llega su CUIT, edición y baja. */
export default function FichaDelCliente() {
  const { espacio } = useTema();
  const router = useRouter();
  const { cuit: parametro } = useLocalSearchParams();
  const [estado, setEstado] = useState<Estado>({ paso: 'cargando' });
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);
  const [problema, setProblema] = useState<string>();

  // El parámetro llega como texto: se valida como cualquier entrada.
  const cuit = typeof parametro === 'string' ? Cuit.crear(parametro) : undefined;
  const clave = cuit?.ok ? cuit.valor.valor : undefined;

  useEffect(() => {
    if (parametro === undefined) {
      setEstado({ paso: 'listo' });
      return;
    }
    if (!cuit?.ok) {
      setEstado({ paso: 'no_encontrado' });
      return;
    }
    let vigente = true;
    clientes.leer(cuit.valor).then(
      (cliente) => {
        if (vigente) setEstado(cliente ? { paso: 'listo', cliente } : { paso: 'no_encontrado' });
      },
      () => {
        if (vigente) setEstado({ paso: 'no_encontrado' });
      },
    );
    return () => {
      vigente = false;
    };
  }, [clave]);

  const guardar = async (cliente: Cliente) => {
    setProblema(undefined);
    setGuardando(true);
    try {
      // Un alta con un CUIT que ya existe se trataría como edición: se avisa en lugar de pisarlo.
      if (estado.paso === 'listo' && !estado.cliente && (await clientes.leer(cliente.cuit))) {
        setProblema('Ya hay un cliente con ese CUIT. Buscalo en la lista para editarlo.');
        return;
      }
      await clientes.guardar(cliente);
      router.back();
    } catch (error) {
      registro.error('no se pudo guardar el cliente', error);
      setProblema('No se pudo guardar el cliente. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (cliente: Cliente) => {
    setConfirmandoBorrar(false);
    try {
      await clientes.borrar(cliente.cuit);
      router.back();
    } catch (error) {
      registro.error('no se pudo borrar el cliente', error);
      setProblema('No se pudo borrar el cliente. Probá de nuevo.');
    }
  };

  const editando = estado.paso === 'listo' ? estado.cliente : undefined;

  return (
    <Pantalla conEncabezado>
      <Stack.Screen options={{ title: editando ? 'Cliente' : 'Nuevo cliente' }} />
      {estado.paso === 'no_encontrado' && (
        <Aviso icono="alert-circle-outline" tono="error">
          No se encontró el cliente.
        </Aviso>
      )}
      {estado.paso === 'listo' && (
        <ScrollView
          contentContainerStyle={{ padding: espacio.normal, gap: espacio.normal }}
          keyboardShouldPersistTaps="handled"
        >
          <FormularioDeCliente
            {...(editando && { inicial: editando })}
            textoDelBoton={editando ? 'Guardar cambios' : 'Guardar cliente'}
            onListo={(cliente) => void guardar(cliente)}
            ocupado={guardando}
          />
          {problema !== undefined && (
            <Aviso icono="alert-circle-outline" tono="error">
              {problema}
            </Aviso>
          )}
          {editando && (
            <Boton
              variante="texto"
              icon="delete-outline"
              onPress={() => {
                setConfirmandoBorrar(true);
              }}
            >
              Borrar cliente
            </Boton>
          )}
          {editando && (
            <DialogoDeConfirmacion
              visible={confirmandoBorrar}
              titulo="¿Borrar el cliente?"
              mensaje="Las facturas que ya le emitiste no cambian. Si le volvés a facturar, se agrega de nuevo."
              confirmar="Borrar"
              onConfirmar={() => void borrar(editando)}
              onCancelar={() => {
                setConfirmandoBorrar(false);
              }}
            />
          )}
        </ScrollView>
      )}
    </Pantalla>
  );
}
