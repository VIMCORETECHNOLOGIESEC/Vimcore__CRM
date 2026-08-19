import type { RedSocial, SemaforoLead } from "@/tipos/lead";

/**
 * Paleta del dashboard (F5, docs/09-linea-grafica-frontend.md) -- **ya
 * cerrada y validada contra el checklist de accesibilidad**, no se modifica
 * ni se le agregan gradientes/sombras. Definida una única vez acá y
 * reutilizada por los 6 gráficos; ningún componente de gráfico redeclara
 * estos hex.
 */

/**
 * Categórica, orden fijo (docs/09): se asigna en secuencia según el orden
 * de aparición de la categoría, nunca cíclicamente. Coincide en tamaño con
 * la cantidad de valores de `RedSocial` (5) -- para series con más de 5
 * categorías (ninguna existe hoy en el fixture: 4 responsables, 3
 * campañas), `getColorCategorico` no cicla de vuelta al color 1: repite el
 * último color de la paleta antes que reintroducir una categoría ya usada
 * con un color distinto.
 */
export const PALETA_CATEGORICA = [
  "#DB2777", // 1. magenta
  "#2563EB", // 2. azul
  "#0D9488", // 3. teal
  "#7C3AED", // 4. violeta
  "#0891B2", // 5. cian
] as const;

export function getColorCategorico(indice: number): string {
  return PALETA_CATEGORICA[Math.min(indice, PALETA_CATEGORICA.length - 1)];
}

/**
 * Semáforo: mismos hex que usan los tokens Tailwind `green-600`/`amber-600`/
 * `red-600` que ya usa `SemaforoBadge.tsx` (docs/09). Se usan tal cual, sin
 * revisar la discrepancia de nomenclatura de `semaforo-frio/tibio/caliente`
 * ya señalada ahí -- fuera de alcance de F5.
 */
export const PALETA_SEMAFORO: Record<SemaforoLead, string> = {
  VERDE: "#16A34A",
  AMARILLO: "#D97706",
  ROJO: "#DC2626",
};

/**
 * "Sin calificar" (leads con `semaforo IS NULL`, D14) no es un color de
 * semáforo -- es la ausencia de calificación. El backend real (M9) sí
 * distingue este bucket en `distribucionSemaforo`/`red-social-x-semaforo`, a
 * diferencia del mock anterior que no lo modelaba. Gris neutro, deliberadamente
 * fuera de `PALETA_SEMAFORO` para no confundirlo con un cuarto color de negocio.
 */
export const COLOR_SIN_CALIFICAR = "#94A3B8";

/** Orden canónico de redes sociales para asignar la paleta categórica en secuencia (docs/08 §3.1/§3.5). */
export const ORDEN_REDES_SOCIALES: RedSocial[] = [
  "FACEBOOK",
  "INSTAGRAM",
  "X",
  "LINKEDIN",
  "GOOGLE_FORMS",
];
