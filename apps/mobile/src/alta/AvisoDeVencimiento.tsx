import { avisoDeVencimiento, type AvisoDeVencimiento as Aviso } from '@facturador/aplicacion';
import { FechaCalendario } from '@facturador/dominio';
import { Aviso as AvisoDeUi, Boton, useTema } from '@facturador/ui';
import { View } from 'react-native';

function explicar(aviso: Exclude<Aviso, { tipo: 'vigente' }>, fecha: string): string {
  if (aviso.tipo === 'vencido') {
    return `Tu certificado de ARCA venció el ${fecha}. Sin certificado no se puede facturar: renovalo.`;
  }
  const cuando =
    aviso.dias === 0
      ? 'vence hoy'
      : aviso.dias === 1
        ? 'vence mañana'
        : `vence en ${String(aviso.dias)} días, el ${fecha}`;
  return `Tu certificado de ARCA ${cuando}. Renovalo antes para no quedarte sin facturar.`;
}

/** Avisa que el certificado está por vencer o venció. Sin nada que avisar, no muestra nada. */
export function AvisoDeVencimiento({
  vigenteHasta,
  onRenovar,
}: {
  readonly vigenteHasta: Date;
  /** Sin esta función no hay botón, porque ya se está en la pantalla del certificado. */
  readonly onRenovar?: () => void;
}) {
  const { espacio } = useTema();
  const aviso = avisoDeVencimiento(vigenteHasta, new Date());
  if (aviso.tipo === 'vigente') return null;

  const urgente = aviso.tipo === 'vencido' || aviso.urgente;
  return (
    <View style={{ gap: espacio.chico, alignSelf: 'stretch' }}>
      <AvisoDeUi icono="calendar-alert" {...(urgente && { tono: 'error' as const })}>
        {explicar(aviso, FechaCalendario.enArgentina(vigenteHasta).formatear())}
      </AvisoDeUi>
      {onRenovar && (
        <Boton variante={urgente ? 'principal' : 'secundario'} icon="autorenew" onPress={onRenovar}>
          Renovar el certificado
        </Boton>
      )}
    </View>
  );
}
