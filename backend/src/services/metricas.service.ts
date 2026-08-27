import { EtapaLead, type RedSocial, type Semaforo } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { resolveRangoFechas } from "../lib/rango-fechas.js";
import * as metricasRepository from "../repositories/metricas.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type { MetricasQuery } from "../schemas/metricas.schema.js";
import {
  aplicarRangoFecha,
  resolveAlcanceBase,
  resolveFiltroSql,
  tieneAccesoTotal,
} from "./metricas.access.js";
import type { UsuarioAcceso } from "./leads.access.js";

const ETAPAS_CIERRE: readonly EtapaLead[] = [EtapaLead.VENTA, EtapaLead.NO_VENTA];
const ETAPAS_EMBUDO: readonly EtapaLead[] = [
  EtapaLead.NUEVO,
  EtapaLead.CONTACTADO,
  EtapaLead.CITA,
  EtapaLead.VENTA,
];
const TODAS_LAS_ETAPAS: readonly EtapaLead[] = [...ETAPAS_EMBUDO, EtapaLead.NO_VENTA];

/**
 * docs/08 §4 ("Comparativa"): variación porcentual contra el período
 * anterior; `null` cuando el período anterior tiene menos de 10 leads —
 * decisión propia sobre CUÁL cuenta usar de umbral: la propia base numérica
 * del indicador en el período anterior (para conteos simples, el conteo
 * mismo; para tasas/tiempos, el total de leads que sostiene ese cálculo —
 * ver cada llamador). "menos de 10 leads" en docs/08 es siempre sobre una
 * cantidad de leads, nunca sobre un porcentaje o una duración.
 */
export interface Comparativa {
  actual: number;
  anterior: number;
  variacionPorcentual: number | null;
}

function comparativa(actual: number, anterior: number, umbralLeadsAnterior: number = anterior): Comparativa {
  return {
    actual,
    anterior,
    variacionPorcentual:
      umbralLeadsAnterior < 10 || anterior === 0
        ? null
        : Number((((actual - anterior) / anterior) * 100).toFixed(2)),
  };
}

function round1(valor: number | null): number | null {
  return valor === null ? null : Math.round(valor * 10) / 10;
}

function porcentaje(numerador: number, denominador: number): number | null {
  return denominador === 0 ? null : Number(((numerador / denominador) * 100).toFixed(2));
}

interface PeriodoResuelto {
  desde: Date;
  hasta: Date;
  anteriorDesde: Date;
  anteriorHasta: Date;
}

function resolvePeriodo(query: MetricasQuery): PeriodoResuelto {
  return resolveRangoFechas(query.rango, new Date(), query.desde, query.hasta);
}

// ---------------------------------------------------------------------------
// 2.1-2.7 + 3.6 — GET /api/v1/metricas/resumen
// ---------------------------------------------------------------------------

export interface CerradosDetalle {
  total: Comparativa;
  venta: Comparativa;
  noVenta: Comparativa;
}

export interface TasaConversion {
  /** `null` cuando no hay cerrados en el período (denominador 0). */
  porcentaje: number | null;
  venta: number;
  total: number;
}

export interface TiempoPrimeraRespuesta {
  horasPromedio: number | null;
  sinPrimeraRespuesta: number;
  anteriorHorasPromedio: number | null;
  variacionPorcentual: number | null;
}

export interface TiempoPromedioCierre {
  diasPromedio: number | null;
  anteriorDiasPromedio: number | null;
  variacionPorcentual: number | null;
}

export interface CumplimientoSla {
  porcentaje: number | null;
  anteriorPorcentaje: number | null;
  variacionPorcentual: number | null;
}

export interface DistribucionSemaforo {
  rojo: number;
  amarillo: number;
  verde: number;
  sinCalificar: number;
}

export interface ResumenResponse {
  rango: { desde: Date; hasta: Date };
  totalIngresados: Comparativa;
  enGestion: Comparativa;
  cerrados: CerradosDetalle;
  tasaConversion: { actual: TasaConversion; anterior: TasaConversion; variacionPorcentual: number | null };
  tiempoPrimeraRespuesta: TiempoPrimeraRespuesta;
  tiempoPromedioCierre: TiempoPromedioCierre;
  cumplimientoSla: CumplimientoSla;
  distribucionSemaforo: DistribucionSemaforo;
}

function extraerConteo(filas: metricasRepository.ConteoPorEtapa[], etapa: EtapaLead): number {
  return filas.find((f) => f.etapa === etapa)?.total ?? 0;
}

export async function getResumen(usuario: UsuarioAcceso, query: MetricasQuery): Promise<ResumenResponse> {
  const { desde, hasta, anteriorDesde, anteriorHasta } = resolvePeriodo(query);
  const base = resolveAlcanceBase(usuario, query);

  // 2.1 — por ingresadoEn.
  const whereIngresoActual = aplicarRangoFecha(base, "ingresadoEn", desde, hasta);
  const whereIngresoAnterior = aplicarRangoFecha(base, "ingresadoEn", anteriorDesde, anteriorHasta);
  const [totalIngresadosActual, totalIngresadosAnterior] = await Promise.all([
    metricasRepository.count(whereIngresoActual),
    metricasRepository.count(whereIngresoAnterior),
  ]);

  // 2.2 — "en gestión": decisión propia, scopeado por ingresadoEn (docs/08
  // no aclara el campo de fecha para este indicador; ver
  // `metricas.access.ts` para el criterio general).
  const whereGestionActual = { ...whereIngresoActual, etapa: { notIn: [...ETAPAS_CIERRE] } };
  const whereGestionAnterior = { ...whereIngresoAnterior, etapa: { notIn: [...ETAPAS_CIERRE] } };
  const [enGestionActual, enGestionAnterior] = await Promise.all([
    metricasRepository.count(whereGestionActual),
    metricasRepository.count(whereGestionAnterior),
  ]);

  // 2.3/2.4 — por cerradoEn (docs/08 §2.3, criterio explícito).
  const whereCierreActual = { ...aplicarRangoFecha(base, "cerradoEn", desde, hasta), etapa: { in: [...ETAPAS_CIERRE] } };
  const whereCierreAnterior = {
    ...aplicarRangoFecha(base, "cerradoEn", anteriorDesde, anteriorHasta),
    etapa: { in: [...ETAPAS_CIERRE] },
  };
  const [cierreActual, cierreAnterior] = await Promise.all([
    metricasRepository.countPorEtapa(whereCierreActual),
    metricasRepository.countPorEtapa(whereCierreAnterior),
  ]);
  const ventaActual = extraerConteo(cierreActual, EtapaLead.VENTA);
  const noVentaActual = extraerConteo(cierreActual, EtapaLead.NO_VENTA);
  const ventaAnterior = extraerConteo(cierreAnterior, EtapaLead.VENTA);
  const noVentaAnterior = extraerConteo(cierreAnterior, EtapaLead.NO_VENTA);
  const totalCierreActual = ventaActual + noVentaActual;
  const totalCierreAnterior = ventaAnterior + noVentaAnterior;

  // 2.5/2.7 — correlacionados contra lead_eventos, scopeados por ingresadoEn
  // (ver nota de decisión en `metricas.repository.ts::getRespuestaYSla`).
  //
  // Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `getRespuestaYSla`/
  // `getCierrePromedio` usan `$queryRaw` — la extensión `$allOperations` de
  // `lib/prisma.ts` SOLO aplica las GUCs de tenant para operaciones de
  // MODELO (`model !== undefined`); una raw query llamada directo sobre
  // `prisma` nunca abre transacción propia, así que corre SIEMPRE sin GUCs,
  // sin importar el `TenantContext` ambiente. Envolver en `prisma.
  // $transaction(...)` fuerza que la extensión SÍ las aplique como primer
  // statement de esa transacción antes de cada raw query.
  const filtroIngresoActual = resolveFiltroSql(usuario, query, "ingresado_en", desde, hasta);
  const filtroIngresoAnterior = resolveFiltroSql(usuario, query, "ingresado_en", anteriorDesde, anteriorHasta);
  const [respuestaActual, respuestaAnterior] = await prisma.$transaction((tx) =>
    Promise.all([
      metricasRepository.getRespuestaYSla(filtroIngresoActual, tx),
      metricasRepository.getRespuestaYSla(filtroIngresoAnterior, tx),
    ]),
  );

  // 2.6 — por cerradoEn, solo VENTA.
  const filtroCierreActual = resolveFiltroSql(usuario, query, "cerrado_en", desde, hasta);
  const filtroCierreAnterior = resolveFiltroSql(usuario, query, "cerrado_en", anteriorDesde, anteriorHasta);
  const [cierrePromedioActual, cierrePromedioAnterior] = await prisma.$transaction((tx) =>
    Promise.all([
      metricasRepository.getCierrePromedio(filtroCierreActual, tx),
      metricasRepository.getCierrePromedio(filtroCierreAnterior, tx),
    ]),
  );

  // 3.6 — distribución por semáforo sobre "en gestión" (actual, sin comparativa).
  const distribucionFilas = await metricasRepository.countPorSemaforo(whereGestionActual);
  const distribucionSemaforo: DistribucionSemaforo = {
    rojo: distribucionFilas.find((f) => f.semaforo === "ROJO")?.total ?? 0,
    amarillo: distribucionFilas.find((f) => f.semaforo === "AMARILLO")?.total ?? 0,
    verde: distribucionFilas.find((f) => f.semaforo === "VERDE")?.total ?? 0,
    sinCalificar: distribucionFilas.find((f) => f.semaforo === null)?.total ?? 0,
  };

  const tasaActualPct = porcentaje(ventaActual, totalCierreActual);
  const tasaAnteriorPct = porcentaje(ventaAnterior, totalCierreAnterior);

  const horasPromedioActual = round1(
    respuestaActual.promedioSegundosRespuesta === null ? null : respuestaActual.promedioSegundosRespuesta / 3600,
  );
  const horasPromedioAnterior = round1(
    respuestaAnterior.promedioSegundosRespuesta === null ? null : respuestaAnterior.promedioSegundosRespuesta / 3600,
  );

  const diasPromedioActual = round1(
    cierrePromedioActual.promedioSegundos === null ? null : cierrePromedioActual.promedioSegundos / 86_400,
  );
  const diasPromedioAnterior = round1(
    cierrePromedioAnterior.promedioSegundos === null ? null : cierrePromedioAnterior.promedioSegundos / 86_400,
  );

  const slaActualPct = porcentaje(respuestaActual.atendidosDentro24h, respuestaActual.totalAsignados);
  const slaAnteriorPct = porcentaje(respuestaAnterior.atendidosDentro24h, respuestaAnterior.totalAsignados);

  return {
    rango: { desde, hasta },
    totalIngresados: comparativa(totalIngresadosActual, totalIngresadosAnterior),
    enGestion: comparativa(enGestionActual, enGestionAnterior),
    cerrados: {
      total: comparativa(totalCierreActual, totalCierreAnterior),
      venta: comparativa(ventaActual, ventaAnterior),
      noVenta: comparativa(noVentaActual, noVentaAnterior),
    },
    tasaConversion: {
      actual: { porcentaje: tasaActualPct, venta: ventaActual, total: totalCierreActual },
      anterior: { porcentaje: tasaAnteriorPct, venta: ventaAnterior, total: totalCierreAnterior },
      variacionPorcentual:
        totalCierreAnterior < 10 || tasaActualPct === null || tasaAnteriorPct === null || tasaAnteriorPct === 0
          ? null
          : Number((((tasaActualPct - tasaAnteriorPct) / tasaAnteriorPct) * 100).toFixed(2)),
    },
    tiempoPrimeraRespuesta: {
      horasPromedio: horasPromedioActual,
      sinPrimeraRespuesta: respuestaActual.sinPrimeraRespuesta,
      anteriorHorasPromedio: horasPromedioAnterior,
      variacionPorcentual:
        respuestaAnterior.totalAsignados < 10 || horasPromedioActual === null || horasPromedioAnterior === null || horasPromedioAnterior === 0
          ? null
          : Number((((horasPromedioActual - horasPromedioAnterior) / horasPromedioAnterior) * 100).toFixed(2)),
    },
    tiempoPromedioCierre: {
      diasPromedio: diasPromedioActual,
      anteriorDiasPromedio: diasPromedioAnterior,
      variacionPorcentual:
        cierrePromedioAnterior.totalVentas < 10 || diasPromedioActual === null || diasPromedioAnterior === null || diasPromedioAnterior === 0
          ? null
          : Number((((diasPromedioActual - diasPromedioAnterior) / diasPromedioAnterior) * 100).toFixed(2)),
    },
    cumplimientoSla: {
      porcentaje: slaActualPct,
      anteriorPorcentaje: slaAnteriorPct,
      variacionPorcentual:
        respuestaAnterior.totalAsignados < 10 || slaActualPct === null || slaAnteriorPct === null || slaAnteriorPct === 0
          ? null
          : Number((((slaActualPct - slaAnteriorPct) / slaAnteriorPct) * 100).toFixed(2)),
    },
    distribucionSemaforo,
  };
}

// ---------------------------------------------------------------------------
// 3.1 — GET /api/v1/metricas/por-red-social
// ---------------------------------------------------------------------------

export interface PorRedSocialItem {
  redSocial: RedSocial;
  total: number;
  ventas: number;
  noVentas: number;
  tasaConversionPct: number | null;
}

export async function getPorRedSocial(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Promise<PorRedSocialItem[]> {
  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFecha(resolveAlcanceBase(usuario, query), "ingresadoEn", desde, hasta);

  const [totales, cierres] = await Promise.all([
    metricasRepository.countPorRedSocial(where),
    metricasRepository.countPorRedSocialYEtapaCierre(where),
  ]);

  return totales.map((fila) => {
    const ventas = cierres.find((c) => c.redSocial === fila.redSocial && c.etapa === "VENTA")?.total ?? 0;
    const noVentas = cierres.find((c) => c.redSocial === fila.redSocial && c.etapa === "NO_VENTA")?.total ?? 0;
    return {
      redSocial: fila.redSocial as RedSocial,
      total: fila.total,
      ventas,
      noVentas,
      tasaConversionPct: porcentaje(ventas, ventas + noVentas),
    };
  });
}

// ---------------------------------------------------------------------------
// 3.2 — GET /api/v1/metricas/por-asesor (solo admin/supervisor, docs/08 §3.2)
// ---------------------------------------------------------------------------

export interface PorAsesorItem {
  responsableId: string;
  nombre: string;
  total: number;
  ventas: number;
  noVentas: number;
  tasaConversionPct: number | null;
  cumplimientoSlaPct: number | null;
}

export async function getPorAsesor(usuario: UsuarioAcceso, query: MetricasQuery): Promise<PorAsesorItem[]> {
  if (!tieneAccesoTotal(usuario)) {
    throw new AppError("permiso_denegado", 403, "Solo administrador o supervisor pueden consultar esta gráfica");
  }

  const { desde, hasta } = resolvePeriodo(query);
  const filtro = resolveFiltroSql(usuario, query, "ingresado_en", desde, hasta);
  // Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): ver nota en
  // `getResumen` — `getPorAsesorConSla` usa `$queryRaw`, necesita una
  // transacción explícita para que se apliquen las GUCs de tenant.
  const filas = await prisma.$transaction((tx) => metricasRepository.getPorAsesorConSla(filtro, tx));
  const nombres = await usuarioRepository.findNombresPorIds(filas.map((f) => f.responsableId));

  return filas.map((fila) => {
    const responsable = nombres.get(fila.responsableId);
    const nombre =
      responsable === undefined
        ? "(usuario dado de baja)"
        : responsable.activo
          ? responsable.nombre
          : `${responsable.nombre} (usuario dado de baja)`;
    return {
      responsableId: fila.responsableId,
      nombre,
      total: fila.total,
      ventas: fila.ventas,
      noVentas: fila.noVentas,
      tasaConversionPct: porcentaje(fila.ventas, fila.ventas + fila.noVentas),
      cumplimientoSlaPct: porcentaje(fila.atendidosDentro24h, fila.asignados),
    };
  });
}

// ---------------------------------------------------------------------------
// GET /api/v1/metricas/por-etapa — conteo simple por las 5 etapas.
// ---------------------------------------------------------------------------

export interface PorEtapaItem {
  etapa: EtapaLead;
  total: number;
}

export async function getPorEtapa(usuario: UsuarioAcceso, query: MetricasQuery): Promise<PorEtapaItem[]> {
  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFecha(resolveAlcanceBase(usuario, query), "ingresadoEn", desde, hasta);
  const filas = await metricasRepository.countPorEtapa(where);
  return TODAS_LAS_ETAPAS.map((etapa) => ({ etapa, total: extraerConteo(filas, etapa) }));
}

// ---------------------------------------------------------------------------
// 3.3 — GET /api/v1/metricas/embudo
// ---------------------------------------------------------------------------

export interface EmbudoPaso {
  etapa: EtapaLead;
  total: number;
  /** `null` en el primer paso (no hay paso previo del que caer). */
  caidaPct: number | null;
}

export interface EmbudoResponse {
  pasos: EmbudoPaso[];
  noVenta: number;
}

export async function getEmbudo(usuario: UsuarioAcceso, query: MetricasQuery): Promise<EmbudoResponse> {
  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFecha(resolveAlcanceBase(usuario, query), "ingresadoEn", desde, hasta);
  const filas = await metricasRepository.countPorEtapa(where);

  let anterior: number | null = null;
  const pasos: EmbudoPaso[] = ETAPAS_EMBUDO.map((etapa) => {
    const total = extraerConteo(filas, etapa);
    const caidaPct = anterior === null || anterior === 0 ? null : Number((((anterior - total) / anterior) * 100).toFixed(2));
    anterior = total;
    return { etapa, total, caidaPct };
  });

  return { pasos, noVenta: extraerConteo(filas, EtapaLead.NO_VENTA) };
}

// ---------------------------------------------------------------------------
// 3.4 — GET /api/v1/metricas/por-campania
// ---------------------------------------------------------------------------

export interface PorCampaniaItem {
  nombreCampania: string;
  redSocial: RedSocial | null;
  total: number;
}

export async function getPorCampania(usuario: UsuarioAcceso, query: MetricasQuery): Promise<PorCampaniaItem[]> {
  const { desde, hasta } = resolvePeriodo(query);
  const filtro = resolveFiltroSql(usuario, query, "ingresado_en", desde, hasta);
  // Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): ver nota en
  // `getResumen` — `getPorCampaniaTop10` usa `$queryRaw`, necesita una
  // transacción explícita para que se apliquen las GUCs de tenant.
  const filas = await prisma.$transaction((tx) => metricasRepository.getPorCampaniaTop10(filtro, tx));
  return filas.map((f) => ({
    nombreCampania: f.nombreCampania,
    redSocial: f.redSocial as RedSocial | null,
    total: f.total,
  }));
}

// ---------------------------------------------------------------------------
// 3.5 — GET /api/v1/metricas/red-social-x-semaforo (matriz cruzada)
// ---------------------------------------------------------------------------

export interface RedSocialXSemaforoItem {
  redSocial: RedSocial;
  total: number;
  rojo: number;
  amarillo: number;
  verde: number;
  sinCalificar: number;
  pctVerde: number | null;
}

export async function getRedSocialXSemaforo(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Promise<RedSocialXSemaforoItem[]> {
  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFecha(resolveAlcanceBase(usuario, query), "ingresadoEn", desde, hasta);

  const [totales, matriz] = await Promise.all([
    metricasRepository.countPorRedSocial(where),
    metricasRepository.countPorRedSocialYSemaforo(where),
  ]);

  return totales.map((fila) => {
    const buscar = (semaforo: Semaforo | null) =>
      matriz.find((m) => m.redSocial === fila.redSocial && m.semaforo === semaforo)?.total ?? 0;
    const verde = buscar("VERDE");
    return {
      redSocial: fila.redSocial as RedSocial,
      total: fila.total,
      rojo: buscar("ROJO"),
      amarillo: buscar("AMARILLO"),
      verde,
      sinCalificar: buscar(null),
      pctVerde: porcentaje(verde, fila.total),
    };
  });
}
