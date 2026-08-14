import type { EtapaLead, Lead, RedSocial } from "@/tipos/lead";
import type {
  ComparativaValor,
  DistribucionSemaforo,
  MetricasContextoRol,
  MetricasEmbudo,
  MetricasFiltros,
  MetricasPorAsesor,
  MetricasPorCampania,
  MetricasPorEtapa,
  MetricasPorRedSocial,
  RatioMetrica,
  RedSocialPorSemaforo,
  ResumenMetricas,
} from "@/tipos/metricas";
import { calculatePeriodoAnterior } from "./rangoFechas";
import { getResponsable } from "../leads/leads.utils";

/**
 * Agregaciones puras del dashboard (docs/08-dashboard-kpis.md), separadas de
 * `metricas.api.ts` (que solo envuelve estas funciones con el mock
 * `LEADS_MOCK` y el retardo simulado) siguiendo el mismo criterio de
 * separación que `leads.utils.ts`/`leads.api.ts` en F3. Reciben `leads: Lead[]`
 * explícito para poder testearse con fixtures pequeños y deterministas, sin
 * depender de las fechas relativas (`hoursAgo`) de `LEADS_MOCK`.
 */

const UMBRAL_COMPARATIVA_LEADS = 10;
const SLA_HORAS_RESPUESTA = 24;

// ---------------------------------------------------------------------------
// Alcance por rol y filtros comunes
// ---------------------------------------------------------------------------

/** Restricción de cartera por rol (docs/08 §1) -- mismo criterio que `LeadsContextoRol` en `leads.api.ts`. */
export function applyAlcanceRol(leads: Lead[], contexto?: MetricasContextoRol): Lead[] {
  if (!contexto) return leads;
  if (contexto.rol === "ASESOR") return leads.filter((l) => l.asesor?.id === contexto.usuarioId);
  if (contexto.rol === "VENDEDOR") return leads.filter((l) => l.vendedor?.id === contexto.usuarioId);
  return leads;
}

/** Filtros combinables de red social/campaña/responsable (docs/08 §4), sin tocar el rango de fechas. */
export function applyFiltrosComunes(leads: Lead[], filtros: MetricasFiltros): Lead[] {
  return leads.filter((lead) => {
    if (filtros.redSocial && lead.redSocial !== filtros.redSocial) return false;
    if (filtros.campaniaId && lead.campania?.id !== filtros.campaniaId) return false;
    if (filtros.responsableId && getResponsable(lead)?.id !== filtros.responsableId) return false;
    return true;
  });
}

/** Igual recorte de fecha (`.slice(0, 10)`, UTC) que `matchesRangoFechas` en `leads.api.ts`. */
function matchesRango(fechaIso: string, filtros: MetricasFiltros): boolean {
  const fecha = fechaIso.slice(0, 10);
  return fecha >= filtros.fechaDesde && fecha <= filtros.fechaHasta;
}

/** Alcance + filtros comunes, sin restricción de fecha -- base para "en gestión" (snapshot, docs/08 §2.2). */
function scopeAlcance(leads: Lead[], filtros: MetricasFiltros, contexto?: MetricasContextoRol): Lead[] {
  return applyFiltrosComunes(applyAlcanceRol(leads, contexto), filtros);
}

/** Alcance + filtros + `ingresadoEn` dentro del rango (docs/08 §2.1 y base de las gráficas 3.1-3.6). */
function scopeIngresadosEnRango(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Lead[] {
  return scopeAlcance(leads, filtros, contexto).filter((l) => matchesRango(l.ingresadoEn, filtros));
}

/** Alcance + filtros + `cerradoEn` dentro del rango (docs/08 §2.3, "los cerrados se cuentan por fecha de cierre"). */
function scopeCerradosEnRango(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): Lead[] {
  return scopeAlcance(leads, filtros, contexto).filter(
    (l) => l.cerradoEn && matchesRango(l.cerradoEn, filtros),
  );
}

// ---------------------------------------------------------------------------
// Helpers numéricos
// ---------------------------------------------------------------------------

function round1(valor: number): number {
  return Math.round(valor * 10) / 10;
}

function average(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((suma, v) => suma + v, 0) / valores.length;
}

/** Ratio con numerador/denominador siempre expuestos junto al porcentaje (docs/08 §2.4). */
export function calculateRatio(numerador: number, denominador: number): RatioMetrica {
  return {
    numerador,
    denominador,
    porcentaje: denominador === 0 ? 0 : round1((numerador / denominador) * 100),
  };
}

/**
 * Comparativa contra el período anterior (docs/08 §4). `variacionPorcentaje`
 * es `null` cuando el período anterior tuvo menos de 10 leads ingresados en
 * total (el umbral se evalúa sobre el volumen general del período anterior,
 * no sobre el denominador de cada métrica individual -- así una tasa de
 * conversión calculada sobre pocos cierres no queda arbitrariamente exenta
 * mientras el resto del período sí tuvo volumen).
 */
export function calculateComparativa(
  actual: number,
  anterior: number,
  totalLeadsPeriodoAnterior: number,
): ComparativaValor {
  if (totalLeadsPeriodoAnterior < UMBRAL_COMPARATIVA_LEADS) {
    return { actual, anterior, variacionPorcentaje: null };
  }
  if (anterior === 0) {
    return { actual, anterior, variacionPorcentaje: actual === 0 ? 0 : 100 };
  }
  return { actual, anterior, variacionPorcentaje: round1(((actual - anterior) / anterior) * 100) };
}

/**
 * Tiempo entre ingreso y arranque del SLA (asignación), en horas.
 *
 * INTEGRACION-BACKEND: aproximación del mock para "tiempo hasta la primera
 * respuesta" (docs/08 §2.5) y "atendido dentro de 24h" (docs/08 §2.7). El
 * mock no tiene tabla `lead_eventos` -- simularla con un event-sourcing
 * completo sería sobre-ingeniería para un fixture. En su lugar se usa
 * `slaInicioEn - ingresadoEn` (el reloj de SLA arranca en la asignación,
 * `leadDetalle.api.ts`) como proxy razonable, solo para leads que ya
 * salieron de NUEVO. El cálculo real requiere
 * `lead_eventos.ASIGNACION`/`CAMBIO_ETAPA` (M9,
 * `docs/06-modulos-backend.md`).
 */
function calculateHorasHastaAsignacion(lead: Lead): number | null {
  if (lead.etapa === "NUEVO" || !lead.slaInicioEn) return null;
  const inicio = new Date(lead.slaInicioEn).getTime();
  const ingreso = new Date(lead.ingresadoEn).getTime();
  return (inicio - ingreso) / (1000 * 60 * 60);
}

function calculateDias(desdeIso: string, hastaIso: string): number {
  return (new Date(hastaIso).getTime() - new Date(desdeIso).getTime()) / (1000 * 60 * 60 * 24);
}

// ---------------------------------------------------------------------------
// 2. Indicadores de resumen
// ---------------------------------------------------------------------------

/** Solo los conteos de volumen del período, usados por la comparativa (sin recalcular todo el resumen). */
function calculateConteosPeriodo(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): { totalIngresados: number; ventaCerrados: number; noVentaCerrados: number } {
  const ingresados = scopeIngresadosEnRango(leads, filtros, contexto);
  const cerrados = scopeCerradosEnRango(leads, filtros, contexto);
  return {
    totalIngresados: ingresados.length,
    ventaCerrados: cerrados.filter((l) => l.etapa === "VENTA").length,
    noVentaCerrados: cerrados.filter((l) => l.etapa === "NO_VENTA").length,
  };
}

export function calculateResumenMetricas(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): ResumenMetricas {
  const alcance = scopeAlcance(leads, filtros, contexto);
  const ingresadosEnRango = alcance.filter((l) => matchesRango(l.ingresadoEn, filtros));
  const cerradosEnRango = alcance.filter((l) => l.cerradoEn && matchesRango(l.cerradoEn, filtros));

  const enGestion = alcance.filter((l) => l.etapa !== "VENTA" && l.etapa !== "NO_VENTA").length;
  const ventaCerrados = cerradosEnRango.filter((l) => l.etapa === "VENTA");
  const noVentaCerrados = cerradosEnRango.filter((l) => l.etapa === "NO_VENTA");

  const horasRespuesta = ingresadosEnRango
    .map(calculateHorasHastaAsignacion)
    .filter((h): h is number => h !== null);
  const promedioHorasRespuesta = average(horasRespuesta);

  const asignados = ingresadosEnRango.filter((l) => l.slaInicioEn);
  const atendidosDentroDe24h = asignados.filter((l) => {
    const horas = calculateHorasHastaAsignacion(l);
    return horas !== null && horas <= SLA_HORAS_RESPUESTA;
  });

  const tiemposCierreVenta = ventaCerrados.map((l) => calculateDias(l.ingresadoEn, l.cerradoEn!));
  const tiemposCierreNoVenta = noVentaCerrados.map((l) => calculateDias(l.ingresadoEn, l.cerradoEn!));

  const conteosAnterior = calculateConteosPeriodo(
    leads,
    { ...filtros, ...calculatePeriodoAnteriorFiltros(filtros) },
    contexto,
  );

  return {
    totalIngresados: ingresadosEnRango.length,
    enGestion,
    cerrados: { venta: ventaCerrados.length, noVenta: noVentaCerrados.length },
    tasaConversion: calculateRatio(ventaCerrados.length, ventaCerrados.length + noVentaCerrados.length),
    tiempoPromedioPrimeraRespuestaHoras: promedioHorasRespuesta === null ? null : round1(promedioHorasRespuesta),
    leadsSinPrimeraRespuesta: ingresadosEnRango.filter((l) => l.etapa === "NUEVO").length,
    tiempoPromedioCierreDias:
      tiemposCierreVenta.length === 0 ? null : round1(average(tiemposCierreVenta)!),
    tiempoPromedioCierreNoVentaDias:
      tiemposCierreNoVenta.length === 0 ? null : round1(average(tiemposCierreNoVenta)!),
    cumplimientoSla:
      asignados.length === 0 ? null : calculateRatio(atendidosDentroDe24h.length, asignados.length),
    comparativa: {
      totalIngresados: calculateComparativa(
        ingresadosEnRango.length,
        conteosAnterior.totalIngresados,
        conteosAnterior.totalIngresados,
      ),
      cerradosVenta: calculateComparativa(
        ventaCerrados.length,
        conteosAnterior.ventaCerrados,
        conteosAnterior.totalIngresados,
      ),
      cerradosNoVenta: calculateComparativa(
        noVentaCerrados.length,
        conteosAnterior.noVentaCerrados,
        conteosAnterior.totalIngresados,
      ),
    },
  };
}

function calculatePeriodoAnteriorFiltros(filtros: MetricasFiltros): Pick<MetricasFiltros, "fechaDesde" | "fechaHasta"> {
  return calculatePeriodoAnterior({ fechaDesde: filtros.fechaDesde, fechaHasta: filtros.fechaHasta });
}

// ---------------------------------------------------------------------------
// 3. Gráficas
// ---------------------------------------------------------------------------

/** 3.1 Leads por red social, con tasa de conversión de cohorte (de los ingresados en el rango, cuántos ya cerraron en venta). */
export function calculateMetricasPorRedSocial(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): MetricasPorRedSocial[] {
  const ingresados = scopeIngresadosEnRango(leads, filtros, contexto);
  const redes = new Map<RedSocial, Lead[]>();
  for (const lead of ingresados) {
    const lista = redes.get(lead.redSocial) ?? [];
    lista.push(lead);
    redes.set(lead.redSocial, lista);
  }

  return [...redes.entries()].map(([redSocial, leadsRed]) => {
    const venta = leadsRed.filter((l) => l.etapa === "VENTA").length;
    const noVenta = leadsRed.filter((l) => l.etapa === "NO_VENTA").length;
    return {
      redSocial,
      total: leadsRed.length,
      tasaConversion: calculateRatio(venta, venta + noVenta),
    };
  });
}

/** 3.2 Leads por responsable operativo (asesor o vendedor traspasado, `getResponsable`). Solo admin/supervisor la ven (control de UI). */
export function calculateMetricasPorAsesor(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): MetricasPorAsesor[] {
  const ingresados = scopeIngresadosEnRango(leads, filtros, contexto);
  const porResponsable = new Map<string, { nombre: string; leads: Lead[] }>();

  for (const lead of ingresados) {
    const responsable = getResponsable(lead);
    if (!responsable) continue;
    const entrada = porResponsable.get(responsable.id) ?? { nombre: responsable.nombre, leads: [] };
    entrada.leads.push(lead);
    porResponsable.set(responsable.id, entrada);
  }

  const resultado: MetricasPorAsesor[] = [...porResponsable.entries()].map(([responsableId, { nombre, leads: leadsResp }]) => {
    const venta = leadsResp.filter((l) => l.etapa === "VENTA").length;
    const noVenta = leadsResp.filter((l) => l.etapa === "NO_VENTA").length;
    const asignados = leadsResp.filter((l) => l.slaInicioEn);
    const atendidos = asignados.filter((l) => {
      const horas = calculateHorasHastaAsignacion(l);
      return horas !== null && horas <= SLA_HORAS_RESPUESTA;
    });

    return {
      responsableId,
      nombre,
      total: leadsResp.length,
      tasaConversion: calculateRatio(venta, venta + noVenta),
      cumplimientoSla: asignados.length === 0 ? null : calculateRatio(atendidos.length, asignados.length),
    };
  });

  return resultado.sort((a, b) => b.total - a.total);
}

const ETAPAS_EMBUDO: EtapaLead[] = ["NUEVO", "CONTACTADO", "CITA", "VENTA"];

/**
 * 3.3 Embudo por etapa. Recharts no trae un componente de embudo nativo, así
 * que se arma con conteos + % de caída consumidos por un `BarChart`
 * horizontal decreciente (`GraficoEmbudo.tsx`) en vez de un layout de
 * embudo real.
 *
 * El conteo de cada paso es el número de leads **actualmente** en esa etapa
 * dentro del rango (foto del pipeline), no el acumulado histórico de leads
 * que alguna vez pasaron por ella camino a una etapa posterior -- eso
 * requeriría `lead_eventos.CAMBIO_ETAPA` (M9). Con el fixture de F3 el
 * resultado igual es decreciente (3, 3, 2, 1), pero con datos reales del
 * mock esta foto podría no serlo; el embudo real de M9 sí sería monótono
 * porque cuenta "llegó a esta etapa", no "está en esta etapa ahora".
 */
export function calculateEmbudoPorEtapa(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): MetricasEmbudo {
  const ingresados = scopeIngresadosEnRango(leads, filtros, contexto);

  let anterior: number | null = null;
  const pasos: MetricasPorEtapa[] = ETAPAS_EMBUDO.map((etapa) => {
    const total = ingresados.filter((l) => l.etapa === etapa).length;
    const caidaPorcentaje = anterior === null || anterior === 0 ? null : round1(((anterior - total) / anterior) * 100);
    anterior = total;
    return { etapa, total, caidaPorcentaje };
  });

  return {
    pasos,
    noVentaTotal: ingresados.filter((l) => l.etapa === "NO_VENTA").length,
  };
}

/**
 * 3.4 Leads por campaña, top 10. Se agrupa por `(campaniaId, redSocial)`
 * porque una misma campaña puede correr en redes distintas y son registros
 * independientes (docs/08 §3.4) -- `CampaniaLead` (docs/03) no trae su
 * propia red social, la red vive en el lead, así que la clave compuesta se
 * arma en el momento de agregar, no en el modelo de datos.
 */
export function calculateMetricasPorCampania(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): MetricasPorCampania[] {
  const ingresados = scopeIngresadosEnRango(leads, filtros, contexto).filter((l) => l.campania);
  const porCampania = new Map<string, MetricasPorCampania>();

  for (const lead of ingresados) {
    const campania = lead.campania!;
    const clave = `${campania.id}::${lead.redSocial}`;
    const entrada = porCampania.get(clave) ?? {
      campaniaId: campania.id,
      nombre: campania.nombre,
      redSocial: lead.redSocial,
      total: 0,
    };
    entrada.total += 1;
    porCampania.set(clave, entrada);
  }

  return [...porCampania.values()].sort((a, b) => b.total - a.total).slice(0, 10);
}

/** 3.5 Red social × semáforo. Incluye todas las etapas (a diferencia de la 3.6): el cierre en Venta/No Venta también informa la calidad de cada red. */
export function calculateRedSocialPorSemaforo(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): RedSocialPorSemaforo[] {
  const ingresados = scopeIngresadosEnRango(leads, filtros, contexto);
  const redes = new Map<RedSocial, Lead[]>();
  for (const lead of ingresados) {
    const lista = redes.get(lead.redSocial) ?? [];
    lista.push(lead);
    redes.set(lead.redSocial, lista);
  }

  return [...redes.entries()].map(([redSocial, leadsRed]) => {
    const verde = leadsRed.filter((l) => l.semaforo === "VERDE").length;
    const amarillo = leadsRed.filter((l) => l.semaforo === "AMARILLO").length;
    const rojo = leadsRed.filter((l) => l.semaforo === "ROJO").length;
    const total = leadsRed.length;
    return {
      redSocial,
      verde,
      amarillo,
      rojo,
      total,
      porcentajeVerde: total === 0 ? 0 : round1((verde / total) * 100),
    };
  });
}

/** 3.6 Distribución por semáforo, solo sobre leads en gestión (excluye VENTA/NO_VENTA, cuyo color es fijo). */
export function calculateDistribucionSemaforo(
  leads: Lead[],
  filtros: MetricasFiltros,
  contexto?: MetricasContextoRol,
): DistribucionSemaforo[] {
  const enGestion = scopeIngresadosEnRango(leads, filtros, contexto).filter(
    (l) => l.etapa !== "VENTA" && l.etapa !== "NO_VENTA",
  );

  return (["VERDE", "AMARILLO", "ROJO"] as const).map((semaforo) => ({
    semaforo,
    total: enGestion.filter((l) => l.semaforo === semaforo).length,
  }));
}
