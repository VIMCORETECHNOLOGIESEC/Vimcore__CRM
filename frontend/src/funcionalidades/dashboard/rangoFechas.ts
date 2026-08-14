/**
 * Presets de rango de fechas del dashboard (docs/08 §4: "Hoy · 7 días · 30
 * días · Mes actual · Mes anterior · Personalizado"). Puro y con test
 * dedicado (`rangoFechas.test.ts`) -- calcula fechas de calendario en hora
 * local del navegador (cross-cutting quality bar, docs/07), igual criterio
 * que el `<input type="date">` que ya usa `LeadsFiltros.tsx` para
 * "Personalizado".
 *
 * NOTA: la comparación contra `lead.ingresadoEn`/`cerradoEn` en
 * `metricas.utils.ts` sigue el mismo recorte de fecha UTC
 * (`.slice(0, 10)`) que ya usaba `matchesRangoFechas` en `leads.api.ts`
 * desde F3 -- una fecha calculada en hora local puede diferir en un día del
 * recorte UTC cerca de la medianoche; es una limitación heredada de F3, no
 * introducida acá.
 */

export type RangoPreset = "HOY" | "SIETE_DIAS" | "TREINTA_DIAS" | "MES_ACTUAL" | "MES_ANTERIOR";

export interface RangoFechas {
  /** `YYYY-MM-DD`, inclusive. */
  fechaDesde: string;
  /** `YYYY-MM-DD`, inclusive. */
  fechaHasta: string;
}

export const ETIQUETAS_RANGO_PRESET: Record<RangoPreset, string> = {
  HOY: "Hoy",
  SIETE_DIAS: "7 días",
  TREINTA_DIAS: "30 días",
  MES_ACTUAL: "Mes actual",
  MES_ANTERIOR: "Mes anterior",
};

function formatFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function restarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() - dias);
  return copia;
}

/** Calcula el rango concreto de un preset. `PERSONALIZADO` no pasa por acá: lo controla directamente el `<input type="date">`. */
export function calculateRangoPreset(preset: RangoPreset, ahora = new Date()): RangoFechas {
  switch (preset) {
    case "HOY":
      return { fechaDesde: formatFechaLocal(ahora), fechaHasta: formatFechaLocal(ahora) };
    case "SIETE_DIAS":
      return { fechaDesde: formatFechaLocal(restarDias(ahora, 6)), fechaHasta: formatFechaLocal(ahora) };
    case "TREINTA_DIAS":
      return {
        fechaDesde: formatFechaLocal(restarDias(ahora, 29)),
        fechaHasta: formatFechaLocal(ahora),
      };
    case "MES_ACTUAL": {
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { fechaDesde: formatFechaLocal(inicioMes), fechaHasta: formatFechaLocal(ahora) };
    }
    case "MES_ANTERIOR": {
      const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      return {
        fechaDesde: formatFechaLocal(inicioMesAnterior),
        fechaHasta: formatFechaLocal(finMesAnterior),
      };
    }
  }
}

/**
 * Período inmediatamente anterior de igual duración (docs/08 §4,
 * "Comparativa"). Ej.: rango de 7 días -> el período anterior es también de
 * 7 días, terminando el día antes de `fechaDesde`.
 */
export function calculatePeriodoAnterior(rango: RangoFechas): RangoFechas {
  const desde = new Date(`${rango.fechaDesde}T00:00:00`);
  const hasta = new Date(`${rango.fechaHasta}T00:00:00`);
  const duracionDias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;

  const hastaAnterior = restarDias(desde, 1);
  const desdeAnterior = restarDias(hastaAnterior, duracionDias - 1);

  return { fechaDesde: formatFechaLocal(desdeAnterior), fechaHasta: formatFechaLocal(hastaAnterior) };
}
