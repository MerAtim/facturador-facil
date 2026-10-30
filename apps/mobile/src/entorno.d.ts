declare namespace NodeJS {
  interface ProcessEnv {
    /** "si" solo en el build de las pruebas de punta a punta: ARCA simulado y emisor de prueba. */
    readonly EXPO_PUBLIC_DOBLE_DE_ARCA?: string;
  }
}
