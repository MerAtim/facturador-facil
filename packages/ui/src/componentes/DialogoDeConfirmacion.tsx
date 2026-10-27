import { Dialog, Portal } from 'react-native-paper';

import { Boton } from './Boton';
import { Texto } from './Texto';

/** Pide confirmar una acción con consecuencias. `confirmar` nombra la acción, no dice "Aceptar". */
export function DialogoDeConfirmacion({
  visible,
  titulo,
  mensaje,
  confirmar,
  onConfirmar,
  onCancelar,
}: {
  readonly visible: boolean;
  readonly titulo: string;
  readonly mensaje: string;
  readonly confirmar: string;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancelar}>
        <Dialog.Title>{titulo}</Dialog.Title>
        <Dialog.Content>
          <Texto variante="cuerpo">{mensaje}</Texto>
        </Dialog.Content>
        <Dialog.Actions>
          <Boton variante="texto" onPress={onCancelar}>
            Cancelar
          </Boton>
          <Boton variante="texto" onPress={onConfirmar}>
            {confirmar}
          </Boton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
