import { explicarFallaDelPadron, type ContribuyenteDelPadron } from '@facturador/arca';
import type { Cuit } from '@facturador/dominio';
import { useEffect, useState } from 'react';

import { consultarPadronDe, registro } from '../composicion';
import { useConfiguracion } from '../configuracion/configuracion';

export type ConsultaAlPadron =
  | { readonly estado: 'inactiva' }
  | { readonly estado: 'buscando' }
  | { readonly estado: 'encontrado'; readonly datos: ContribuyenteDelPadron }
  | { readonly estado: 'falla'; readonly mensaje: string };

/**
 * Lo encontrado en esta sesión, para no volver a consultar a ARCA al ir y venir entre pantallas.
 * Vive solo en memoria: son datos de terceros y la base de clientes ya guarda lo que se use.
 */
const encontrados = new Map<string, ContribuyenteDelPadron>();

/**
 * Busca en el padrón de ARCA el CUIT que se está cargando. Es una ayuda: sin certificado todavía no
 * se consulta, y si ARCA falla se sigue a mano.
 */
export function usePadron(cuit: Cuit | undefined): ConsultaAlPadron {
  const configuracion = useConfiguracion();
  const [consulta, setConsulta] = useState<ConsultaAlPadron>({ estado: 'inactiva' });
  const lista = configuracion.estado === 'lista' ? configuracion.configuracion : undefined;
  const valor = cuit?.valor;

  useEffect(() => {
    if (!lista || !cuit) {
      setConsulta({ estado: 'inactiva' });
      return;
    }
    const enMemoria = encontrados.get(cuit.valor);
    if (enMemoria) {
      setConsulta({ estado: 'encontrado', datos: enMemoria });
      return;
    }

    // Si cambia el CUIT antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true;
    setConsulta({ estado: 'buscando' });
    consultarPadronDe(lista, cuit).then(
      (resultado) => {
        if (!vigente) return;
        if (!resultado) {
          setConsulta({ estado: 'inactiva' });
        } else if (resultado.ok) {
          encontrados.set(cuit.valor, resultado.valor);
          setConsulta({ estado: 'encontrado', datos: resultado.valor });
        } else {
          setConsulta({ estado: 'falla', mensaje: explicarFallaDelPadron(resultado.error) });
        }
      },
      (error: unknown) => {
        registro.error('falló la consulta al padrón', error);
        if (vigente) setConsulta({ estado: 'falla', mensaje: 'Completá los datos a mano.' });
      },
    );
    return () => {
      vigente = false;
    };
    // El CUIT se compara por valor: el objeto cambia en cada render.
  }, [lista, valor]);

  return consulta;
}
