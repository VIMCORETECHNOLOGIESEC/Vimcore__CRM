/**
 * Presets de rango de fechas del dashboard (docs/08 §4: "Hoy · 7 días · 30
 * días · Mes actual · Mes anterior · Personalizado"). El backend real
 * (`metricasQuerySchema`, `resolveRangoFechas` en `backend/src/lib/rango-fechas.ts`)
 * es quien calcula la ventana de fechas concreta a partir del preset -- este
 * módulo YA NO calcula rangos de calendario en cliente (a diferencia de la
 * versión que acompañaba al mock): el frontend solo manda el literal del
 * preset (`MetricasFiltros["rango"]`) y, si es `"personalizado"`, las fechas
 * elegidas en `<input type="date">`.
 */
import type { RangoMetricas } from "@/tipos/metricas";

/** Presets con cálculo automático de fechas en el backend -- excluye `"personalizado"`, que se maneja aparte (par de `<input type="date">`). */
export type RangoPresetAutomatico = Exclude<RangoMetricas, "personalizado">;

export const PRESETS_AUTOMATICOS: RangoPresetAutomatico[] = ["hoy", "7d", "30d", "mes_actual", "mes_anterior"];

export const ETIQUETAS_RANGO_PRESET: Record<RangoMetricas, string> = {
  hoy: "Hoy",
  "7d": "7 días",
  "30d": "30 días",
  mes_actual: "Mes actual",
  mes_anterior: "Mes anterior",
  personalizado: "Personalizado",
};

/** `YYYY-MM-DD` en hora local del navegador -- mismo formato que espera el `<input type="date">` de "Personalizado". */
export function formatFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}
