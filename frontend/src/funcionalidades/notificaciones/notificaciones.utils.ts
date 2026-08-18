import type { Notificacion } from "@/tipos/notificacion";

/**
 * Lógica pura de notificaciones (F6, docs/07-modulos-frontend.md), separada
 * de la capa mock (`notificaciones.api.ts`) siguiendo el mismo criterio que
 * `leads.utils.ts`/`leads.api.ts` y `metricas.utils.ts`/`metricas.api.ts`:
 * es la parte con lógica real que exige test unitario per AGENTS.md §5.
 */

/** Cuenta cuántas notificaciones de la lista siguen sin leer. */
export function countNoLeidas(notificaciones: Notificacion[]): number {
  return notificaciones.reduce((total, n) => (n.leidaEn ? total : total + 1), 0);
}

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

function formatFechaAbsoluta(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

/**
 * Formato relativo ("hace 5 min", "hace 3 h") para lecturas rápidas en el
 * panel de notificaciones; a partir de un día completo se muestra la fecha
 * absoluta en formato `DD/MM/AAAA HH:mm` (docs/07, "Formato de fechas"),
 * porque "hace 4 días" deja de ser útil para ubicar el momento exacto.
 * `ahora` es inyectable para tests deterministas -- mismo patrón que
 * `sla.ts#calculateEstadoSla`.
 */
export function formatFechaRelativa(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  const transcurridoMs = ahora.getTime() - fecha.getTime();

  if (transcurridoMs < MINUTO_MS) {
    return "hace instantes";
  }
  if (transcurridoMs < HORA_MS) {
    const minutos = Math.floor(transcurridoMs / MINUTO_MS);
    return `hace ${minutos} min`;
  }
  if (transcurridoMs < DIA_MS) {
    const horas = Math.floor(transcurridoMs / HORA_MS);
    return `hace ${horas} h`;
  }
  return formatFechaAbsoluta(fecha);
}

/** Ordena de más reciente a más antigua por `creadaEn`. */
export function sortByFechaDesc(notificaciones: Notificacion[]): Notificacion[] {
  return [...notificaciones].sort(
    (a, b) => new Date(b.creadaEn).getTime() - new Date(a.creadaEn).getTime(),
  );
}
