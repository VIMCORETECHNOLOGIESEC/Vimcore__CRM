export const VENTANA_REINGRESO_DIAS = 90;
// Aritmética de instante UTC (D5): `timestamptz` es un instante absoluto,
// así que milisegundos son exactos y el horario de verano no aplica.
export const VENTANA_REINGRESO_MS = VENTANA_REINGRESO_DIAS * 24 * 60 * 60 * 1000;

// M5 (docs/04-formularios-semaforo.md §2): umbrales del motor de semáforo.
// 🟢 Verde 70-100, 🟡 Amarillo 40-69, 🔴 Rojo 0-39. `UMBRAL_AMARILLO` es el
// piso de la banda amarilla (inclusive), no un techo.
export const UMBRAL_VERDE = 70;
export const UMBRAL_AMARILLO = 40;

// M5 (D9, docs/02-reglas-negocio.md §7): ventana de SLA desde
// `lead.slaInicioEn`. El estado se deriva en cada consulta, nunca se
// persiste.
export const SLA_HORAS = 24;

// docs/05-bridges.md §8 (tabla de casos borde): "Bridge sin leads durante
// 72 h con campañas activas" — umbral del trabajo programado de
// `services/bridge-mudo.service.ts`.
export const BRIDGE_MUDO_HORAS = 72;
