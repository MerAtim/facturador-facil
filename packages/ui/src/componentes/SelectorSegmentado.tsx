import { SegmentedButtons } from 'react-native-paper';

export interface Opcion<T extends string> {
  readonly valor: T;
  readonly etiqueta: string;
}

/** Elección entre dos o tres opciones que se ven todas a la vez, como precio final o neto. */
export function SelectorSegmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  readonly opciones: readonly Opcion<T>[];
  readonly valor: T;
  readonly onCambiar: (valor: T) => void;
}) {
  return (
    <SegmentedButtons
      value={valor}
      onValueChange={(elegido) => {
        const opcion = opciones.find((o) => o.valor === elegido);
        if (opcion) onCambiar(opcion.valor);
      }}
      buttons={opciones.map(({ valor: v, etiqueta }) => ({ value: v, label: etiqueta }))}
    />
  );
}
