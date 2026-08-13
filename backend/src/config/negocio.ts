export const VENTANA_REINGRESO_DIAS = 90;
// Aritmética de instante UTC (D5): `timestamptz` es un instante absoluto,
// así que milisegundos son exactos y el horario de verano no aplica.
export const VENTANA_REINGRESO_MS = VENTANA_REINGRESO_DIAS * 24 * 60 * 60 * 1000;
