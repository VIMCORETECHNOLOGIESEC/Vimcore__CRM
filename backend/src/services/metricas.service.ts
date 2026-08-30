import { EtapaLead, type RedSocial, type Semaforo } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { prisma } from "../lib/prisma.js";
import { resolveRangoFechas } from "../lib/rango-fechas.js";
import * as metaAdsMetricasRepository from "../repositories/metaAds/campania-metrica-diaria.repository.js";
import * as metricasRepository from "../repositories/metricas.repository.js";
import * as productoRepository from "../repositories/negociacion/producto.repository.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type { MetricasQuery } from "../schemas/metricas.schema.js";
import {
  aplicarRangoFecha,
  aplicarRangoFechaOportunidad,
  resolveAlcanceBase,
  resolveAlcanceBaseOportunidad,
  resolveFiltroSql,
  resolveRendimientoCampaniaFiltro,
  tieneAccesoTotal,
} from "./metricas.access.js";
import type { UsuarioAcceso } from "./leads.access.js";
import type { MetaAdsRendimientoCampaniaDto } from "../types/metaAds/meta-ads-oauth.dto.js";

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

function costo(valor: number, denominador: number): number | null {
  return denominador === 0 ? null : Number((valor / denominador).toFixed(2));
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
// GET /api/v1/metricas/rendimiento-campanias — CPC/CPL/CAC reales de Meta Ads.
// ---------------------------------------------------------------------------

export async function getRendimientoCampanias(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Promise<MetaAdsRendimientoCampaniaDto[]> {
  const { desde, hasta } = resolvePeriodo(query);
  const filtro = resolveRendimientoCampaniaFiltro(usuario, query, desde, hasta);
  const filas = await prisma.$transaction((tx) => metaAdsMetricasRepository.getRendimientoCampanias(filtro, tx));

  return filas.map((fila) => ({
    campaniaId: fila.campaniaId,
    idExterno: fila.idExterno,
    nombreCampania: fila.nombreCampania,
    redSocial: fila.redSocial,
    moneda: fila.moneda,
    gasto: Number(fila.gasto.toFixed(2)),
    impresiones: fila.impresiones,
    clics: fila.clics,
    alcance: fila.alcance,
    leads: fila.leads,
    ventas: fila.ventas,
    cpc: costo(fila.gasto, fila.clics),
    cpl: costo(fila.gasto, fila.leads),
    cac: costo(fila.gasto, fila.ventas),
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

// ---------------------------------------------------------------------------
// Extensiones de dashboard (Bloque E, docs/blocks/e-dashboards.md
// "Extensiones de dashboard"): embudo de Oportunidad, rendimiento por
// producto, cascada Lead→Oportunidad→Venta, habilitados vs. no habilitados
// para venta y ranking de productos por empresa. Reusan exactamente el mismo
// alcance por rol/empresa y las mismas convenciones de agregación de arriba
// (`resolveAlcanceBaseOportunidad`/`aplicarRangoFechaOportunidad` en
// `metricas.access.ts`), proyectadas sobre `Oportunidad` en vez de `Lead`
// donde corresponde.
// ---------------------------------------------------------------------------

// GET /api/v1/metricas/embudo-oportunidad — E1.

export interface EmbudoOportunidadResponse {
  pasos: EmbudoPaso[];
  noVenta: number;
}

/**
 * E1: mismo cálculo que `getEmbudo` (3.3), sobre `Oportunidad.etapa` en vez
 * de `Lead.etapa` — "embudo de negociación" vs. "embudo de contacto". Scopea
 * por `creadaEn` (mismo criterio que `Lead.ingresadoEn` en el embudo de
 * contacto: el paso de entrada al embudo es la fecha de apertura, no de
 * cierre).
 */
export async function getEmbudoOportunidad(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Promise<EmbudoOportunidadResponse> {
  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFechaOportunidad(resolveAlcanceBaseOportunidad(usuario, query), "creadaEn", desde, hasta);
  const filas = await metricasRepository.countPorEtapaOportunidad(where);

  let anterior: number | null = null;
  const pasos: EmbudoPaso[] = ETAPAS_EMBUDO.map((etapa) => {
    const total = extraerConteo(filas, etapa);
    const caidaPct = anterior === null || anterior === 0 ? null : Number((((anterior - total) / anterior) * 100).toFixed(2));
    anterior = total;
    return { etapa, total, caidaPct };
  });

  return { pasos, noVenta: extraerConteo(filas, EtapaLead.NO_VENTA) };
}

// GET /api/v1/metricas/por-producto — E2.

export interface PorProductoItem {
  productoId: string;
  nombreProducto: string;
  total: number;
  ventas: number;
  noVentas: number;
  tasaConversionPct: number | null;
}

/**
 * E2: mismo patrón que `getPorRedSocial` (3.1) — total + sub-conteo
 * VENTA/NO_VENTA por grupo, tasa de conversión derivada — agrupado por
 * `Producto` en vez de `RedSocial`. `Producto` es una FK real (no JSONB), así
 * que los nombres se resuelven con un `findMany` directo en vez de una
 * consulta SQL cruda (a diferencia de `getPorCampania`, que sí necesita SQL
 * crudo por leer de `payload_original`).
 */
export async function getPorProducto(usuario: UsuarioAcceso, query: MetricasQuery): Promise<PorProductoItem[]> {
  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFechaOportunidad(resolveAlcanceBaseOportunidad(usuario, query), "creadaEn", desde, hasta);

  const [totales, cierres] = await Promise.all([
    metricasRepository.countPorProducto(where),
    metricasRepository.countPorProductoYEtapaCierre(where),
  ]);

  const productos = await productoRepository.findMany({ id: { in: totales.map((f) => f.productoId) } });
  const nombres = new Map(productos.map((p) => [p.id, p.nombre]));

  return totales.map((fila) => {
    const ventas = cierres.find((c) => c.productoId === fila.productoId && c.etapa === "VENTA")?.total ?? 0;
    const noVentas = cierres.find((c) => c.productoId === fila.productoId && c.etapa === "NO_VENTA")?.total ?? 0;
    return {
      productoId: fila.productoId,
      // `productoId` sobrevive al borrado de `Producto` (Oportunidad.productoId
      // hace SetNull, no Cascade) -- este fallback es defensivo, mismo
      // criterio que "(usuario dado de baja)" en `getPorAsesor`.
      nombreProducto: nombres.get(fila.productoId) ?? "(producto eliminado)",
      total: fila.total,
      ventas,
      noVentas,
      tasaConversionPct: porcentaje(ventas, ventas + noVentas),
    };
  });
}

// GET /api/v1/metricas/cascada-lead-oportunidad — E3.

export interface CascadaLeadOportunidadResponse {
  leads: number;
  conOportunidad: number;
  ventaOportunidad: number;
  /** `null` cuando `leads` es 0 (sin denominador). */
  tasaAperturaPct: number | null;
  /** `null` cuando `conOportunidad` es 0 (sin denominador). */
  tasaCierrePct: number | null;
}

/**
 * E3: cascada Lead → Oportunidad → Venta. Cohorte de `Lead` por
 * `ingresadoEn` en el rango pedido (mismo alcance/`where` que `getResumen`
 * 2.1) — decisión propia: `conOportunidad`/`ventaOportunidad` se miden SIN un
 * segundo filtro de fecha sobre `Oportunidad` (a diferencia de E1/E2, que sí
 * filtran por `creadaEn`), para que la cascada responda "de los leads que
 * ingresaron en el período, cuántos llegaron a estos hitos alguna vez" — un
 * embudo de cohorte, no un cruce de dos rangos de fecha independientes que
 * subcontaría leads cuya Oportunidad se abrió o cerró fuera del rango del
 * propio Lead.
 */
export async function getCascadaLeadOportunidad(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Promise<CascadaLeadOportunidadResponse> {
  const { desde, hasta } = resolvePeriodo(query);
  const whereLeads = aplicarRangoFecha(resolveAlcanceBase(usuario, query), "ingresadoEn", desde, hasta);

  const [leads, conOportunidad, ventaOportunidad] = await Promise.all([
    metricasRepository.count(whereLeads),
    metricasRepository.count({ ...whereLeads, oportunidades: { some: {} } }),
    metricasRepository.count({ ...whereLeads, oportunidades: { some: { etapa: EtapaLead.VENTA } } }),
  ]);

  return {
    leads,
    conOportunidad,
    ventaOportunidad,
    tasaAperturaPct: porcentaje(conOportunidad, leads),
    tasaCierrePct: porcentaje(ventaOportunidad, conOportunidad),
  };
}

// GET /api/v1/metricas/por-habilitado-para-venta — E4.

export interface HabilitadoParaVentaItem {
  habilitadoParaVenta: boolean;
  totalAsesores: number;
  total: number;
  ventas: number;
  noVentas: number;
  tasaConversionPct: number | null;
}

/**
 * E4: eficiencia del handoff D8 — compara el volumen/conversión de
 * `Oportunidad` de asesores con `Membresia.habilitadoParaVenta: true` (pueden
 * cerrar, D7) contra los que no. Restringido a admin/supervisor (docs/08
 * §3.2, mismo criterio que `getPorAsesor`): agrega desempeño por asesor
 * individual, visibilidad cruzada de cartera. Siempre devuelve las dos filas
 * (`true`/`false`), incluso en 0, para que el consumidor no tenga que inferir
 * la ausencia de un grupo.
 */
export async function getPorHabilitadoParaVenta(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Promise<HabilitadoParaVentaItem[]> {
  if (!tieneAccesoTotal(usuario)) {
    throw new AppError("permiso_denegado", 403, "Solo administrador o supervisor pueden consultar esta gráfica");
  }

  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFechaOportunidad(resolveAlcanceBaseOportunidad(usuario, query), "creadaEn", desde, hasta);

  const [totales, cierres] = await Promise.all([
    metricasRepository.countPorAsesorEmpresa(where),
    metricasRepository.countPorAsesorEmpresaYEtapaCierre(where),
  ]);

  const habilitados = await metricasRepository.findHabilitadoParaVentaPorPares(
    totales.map((f) => ({ asesorId: f.asesorId, empresaId: f.empresaId })),
  );

  const acumulado = new Map<boolean, { asesores: Set<string>; total: number; ventas: number; noVentas: number }>([
    [true, { asesores: new Set(), total: 0, ventas: 0, noVentas: 0 }],
    [false, { asesores: new Set(), total: 0, ventas: 0, noVentas: 0 }],
  ]);

  for (const fila of totales) {
    const habilitado = habilitados.get(`${fila.asesorId}:${fila.empresaId}`) ?? false;
    const ventas = cierres.find((c) => c.asesorId === fila.asesorId && c.empresaId === fila.empresaId && c.etapa === "VENTA")?.total ?? 0;
    const noVentas = cierres.find((c) => c.asesorId === fila.asesorId && c.empresaId === fila.empresaId && c.etapa === "NO_VENTA")?.total ?? 0;
    const bucket = acumulado.get(habilitado);
    if (!bucket) continue;
    bucket.asesores.add(fila.asesorId);
    bucket.total += fila.total;
    bucket.ventas += ventas;
    bucket.noVentas += noVentas;
  }

  return [true, false].map((habilitado) => {
    const bucket = acumulado.get(habilitado);
    if (!bucket) throw new AppError("error_interno", 500, "Bucket de habilitación inesperado");
    return {
      habilitadoParaVenta: habilitado,
      totalAsesores: bucket.asesores.size,
      total: bucket.total,
      ventas: bucket.ventas,
      noVentas: bucket.noVentas,
      tasaConversionPct: porcentaje(bucket.ventas, bucket.ventas + bucket.noVentas),
    };
  });
}

// GET /api/v1/metricas/ranking-productos-por-empresa — E5.

export interface RankingProductoPorEmpresaItem {
  empresaId: string;
  nombreEmpresa: string;
  productoId: string;
  nombreProducto: string;
  total: number;
  ventas: number;
  noVentas: number;
  tasaConversionPct: number | null;
}

/**
 * E5: mismo cálculo que `getPorProducto` (E2), agregado también por
 * `empresaId` — útil para un supervisor/administrador holding-wide (D6) que
 * quiere comparar el producto top de cada empresa, no solo el agregado del
 * holding entero. Para una sesión company-scoped (Asesor/Vendedor/
 * Administrador de empresa) devuelve el mismo desglose acotado a su única
 * empresa — `resolveAlcanceBaseOportunidad` ya lo garantiza, sin lógica
 * adicional acá. Orden: por nombre de empresa, luego por volumen descendente
 * — sin recorte top-N por empresa (a diferencia de `getPorCampania`, que sí
 * es top 10 global): el negocio no pidió un límite para este indicador y
 * truncar por empresa exigiría una window function no usada hoy en este
 * archivo.
 */
export async function getRankingProductosPorEmpresa(
  usuario: UsuarioAcceso,
  query: MetricasQuery,
): Promise<RankingProductoPorEmpresaItem[]> {
  const { desde, hasta } = resolvePeriodo(query);
  const where = aplicarRangoFechaOportunidad(resolveAlcanceBaseOportunidad(usuario, query), "creadaEn", desde, hasta);

  const [totales, cierres] = await Promise.all([
    metricasRepository.countPorEmpresaYProducto(where),
    metricasRepository.countPorEmpresaYProductoYEtapaCierre(where),
  ]);

  const [productos, nombresEmpresa] = await Promise.all([
    productoRepository.findMany({ id: { in: totales.map((f) => f.productoId) } }),
    metricasRepository.findEmpresaNombresPorIds(totales.map((f) => f.empresaId)),
  ]);
  const nombresProducto = new Map(productos.map((p) => [p.id, p.nombre]));

  return totales
    .map((fila) => {
      const ventas =
        cierres.find((c) => c.empresaId === fila.empresaId && c.productoId === fila.productoId && c.etapa === "VENTA")
          ?.total ?? 0;
      const noVentas =
        cierres.find(
          (c) => c.empresaId === fila.empresaId && c.productoId === fila.productoId && c.etapa === "NO_VENTA",
        )?.total ?? 0;
      return {
        empresaId: fila.empresaId,
        nombreEmpresa: nombresEmpresa.get(fila.empresaId) ?? "(empresa eliminada)",
        productoId: fila.productoId,
        nombreProducto: nombresProducto.get(fila.productoId) ?? "(producto eliminado)",
        total: fila.total,
        ventas,
        noVentas,
        tasaConversionPct: porcentaje(ventas, ventas + noVentas),
      };
    })
    .sort((a, b) =>
      a.nombreEmpresa === b.nombreEmpresa ? b.total - a.total : a.nombreEmpresa.localeCompare(b.nombreEmpresa),
    );
}
