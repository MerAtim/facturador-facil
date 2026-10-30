import { debeBloquear } from '@facturador/aplicacion';
import { Aviso, Boton, Texto, useTema } from '@facturador/ui';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { preferencias } from '../composicion';

type Estado = 'verificando' | 'bloqueada' | 'desbloqueada' | 'sin_proteccion';

const Proteccion = createContext(true);

/** Si el teléfono tiene un bloqueo de pantalla con el que proteger la app. */
export const useProteccion = () => useContext(Proteccion);

const MENSAJE_DE_ERROR: Partial<Record<LocalAuthentication.LocalAuthenticationError, string>> = {
  lockout: 'Demasiados intentos. Esperá un momento y probá de nuevo.',
  timeout: 'Se acabó el tiempo. Probá de nuevo.',
};

/**
 * Pide el desbloqueo con la biometría o el PIN, patrón o contraseña del teléfono al abrir la app y al
 * volver después de la espera elegida. El sistema limita los intentos y demora los siguientes, algo
 * que un PIN propio de la app no podría garantizar.
 *
 * El contenido queda montado debajo: al desbloquear, el usuario sigue donde estaba.
 */
export function ProveedorDeBloqueo({ children }: { readonly children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('verificando');
  const [error, setError] = useState<string>();
  const salioA = useRef<number | undefined>(undefined);
  // La pantalla de desbloqueo del sistema manda la app a segundo plano: esos cambios no cuentan.
  const autenticando = useRef(false);

  const desbloquear = useCallback(async () => {
    if (autenticando.current) return;
    autenticando.current = true;
    setError(undefined);
    try {
      const resultado = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloqueá Facturador Fácil',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });
      if (resultado.success) {
        salioA.current = undefined;
        setEstado('desbloqueada');
      } else if (resultado.error !== 'user_cancel' && resultado.error !== 'system_cancel') {
        setError(MENSAJE_DE_ERROR[resultado.error] ?? 'No se pudo desbloquear. Probá de nuevo.');
      }
    } finally {
      autenticando.current = false;
    }
  }, []);

  useEffect(() => {
    void LocalAuthentication.getEnrolledLevelAsync().then((nivel) => {
      setEstado(nivel === LocalAuthentication.SecurityLevel.NONE ? 'sin_proteccion' : 'bloqueada');
    });
  }, []);

  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (siguiente) => {
      if (autenticando.current) return;
      if (siguiente === 'background') {
        salioA.current = Date.now();
        return;
      }
      // Quien vuelve de configurar el bloqueo en los ajustes tiene que poder seguir sin reiniciar.
      // No se pide desbloquear: hasta recién el teléfono no tenía protección.
      if (siguiente === 'active' && estado === 'sin_proteccion') {
        void LocalAuthentication.getEnrolledLevelAsync().then((nivel) => {
          if (nivel !== LocalAuthentication.SecurityLevel.NONE) setEstado('desbloqueada');
        });
        return;
      }
      if (siguiente !== 'active' || estado !== 'desbloqueada') return;
      void preferencias.esperaDeBloqueo().then((espera) => {
        if (debeBloquear(salioA.current, Date.now(), espera)) setEstado('bloqueada');
      });
    });
    return () => {
      suscripcion.remove();
    };
  }, [estado]);

  // Al quedar bloqueada se pide el desbloqueo enseguida, sin un toque de más.
  useEffect(() => {
    if (estado === 'bloqueada') void desbloquear();
  }, [estado, desbloquear]);

  return (
    <Proteccion.Provider value={estado !== 'sin_proteccion'}>
      {children}
      {(estado === 'verificando' || estado === 'bloqueada') && (
        <Cortina
          bloqueada={estado === 'bloqueada'}
          error={error}
          onDesbloquear={() => void desbloquear()}
        />
      )}
    </Proteccion.Provider>
  );
}

function Cortina({
  bloqueada,
  error,
  onDesbloquear,
}: {
  readonly bloqueada: boolean;
  readonly error: string | undefined;
  readonly onDesbloquear: () => void;
}) {
  const { colores, espacio } = useTema();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        estilos.cortina,
        { backgroundColor: colores.background, padding: espacio.grande, gap: espacio.normal },
      ]}
      accessibilityViewIsModal
    >
      <Texto variante="titulo">Facturador Fácil</Texto>
      {bloqueada && (
        <>
          <Texto variante="cuerpo" style={estilos.centrado}>
            La app está bloqueada para proteger tus datos fiscales.
          </Texto>
          {error !== undefined && (
            <Aviso icono="alert-circle-outline" tono="error">
              {error}
            </Aviso>
          )}
          <Boton icon="lock-open-variant-outline" onPress={onDesbloquear}>
            Desbloquear
          </Boton>
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  cortina: { alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  centrado: { textAlign: 'center' },
});
