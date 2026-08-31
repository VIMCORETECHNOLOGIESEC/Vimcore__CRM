/**
 * Tipos del dashboard de métricas (F5, docs/08-dashboard-kpis.md). Espejo de
 * la forma real de `GET /api/v1/metricas/*` -- verificado contra
 * `backend/src/schemas/metricas.schema.ts`,
 * `backend/src/controllers/metricas.controller.ts` y
 * `backend/src/services/metricas.service.ts` (worktree `dev-back`).
 */
import type { EtapaLead, RedSocial } from "./lead";

/**
 * Los 6 presets de rango (docs/08 §4) -- literal idéntico al enum Zod
 * `RANGOS_PRESET` de `metricas.schema.ts`. El backend resuelve la ventana de
 * fechas concreta a partir de este valor (y, si es `"personalizado"`, de
 * `desde`/`hasta`) -- el frontend ya NO calcula rangos de calendario en
 * cliente (a diferencia del mock anterior, ver `rangoFechas.ts`).
 */
export type RangoMetricas = "hoy" | "7d" | "30d" | "mes_actual" | "mes_anterior" | "personalizado";

/**
 * Query params compartidos por los 7 endpoints (docs/08 §4,
 * `metricasQuerySchema`). `desde`/`hasta` (`YYYY-MM-DD`) solo tienen efecto
 * -- y son obligatorios -- cuando `rango === "personalizado"`; el backend los
 * valida con `superRefine`, el frontend no repite esa validación.
 * `responsableId` solo tiene efecto real si lo pide administrador/supervisor
 * -- si lo manda un asesor/vendedor, el backend lo ignora en silencio.
 * `campania` es texto libre (`ILIKE` contra `payload_original ->>
 * 'nombreCampania'`), no un id de catálogo.
 *
 * `empresaId` (docs/23 item 14, "Dashboard con filtro por empresa (holding)")
 * -- forward-compatible con `resolveEmpresaId` de
 * `backend/src/services/metricas.access.ts` (todavía sin mergear a esta
 * rama, el schema real de este branch descarta en silencio cualquier query
 * param desconocido, mismo criterio que `usuarios.api.ts`/`bridges.api.ts`
 * con su propio `empresaId` no-vigente-todavía). Solo tiene efecto real para
 * una sesión holding-wide -- una sesión `company` ya trae su `empresaId`
 * forzado del lado del servidor, así que el frontend nunca lo manda para
 * ese caso (`DashboardPage.tsx` solo lo setea vía `useVistaEmpresa`, que a
 * su vez solo se expone a `ADMINISTRADOR` + `sessionScope holding`).
 */
export interface MetricasFiltros {
  rango: RangoMetricas;
  desde?: string;
  hasta?: string;
  redSocial?: RedSocial;
  campania?: string;
  responsableId?: string;
  empresaId?: string;
}

/**
 * Comparativa contra el período inmediatamente anterior de igual duración
 * (docs/08 §4). `variacionPorcentual` es `null` cuando el período anterior
 * tuvo menos de 10 leads en la categoría específica del indicador -- el
 * umbral ya viene resuelto desde el backend, el frontend no lo recalcula.
 */
export interface Comparativa {
  actual: number;
  anterior: number;
  variacionPorcentual: number | null;
}

export interface TasaConversionDetalle {
  /** `null` cuando no hay cerrados en el período (denominador 0). */
  porcentaje: number | null;
  venta: number;
  total: number;
}

export interface DistribucionSemaforo {
  rojo: number;
  amarillo: number;
  verde: number;
  /** Leads sin calificar todavía (`semaforo IS NULL`, D14). */
  sinCalificar: number;
}

export interface ResumenMetricas {
  rango: { desde: string; hasta: string };
  totalIngresados: Comparativa;
  /** Snapshot vigente del pipeline (docs/08 §2.2) -- el backend igual expone comparativa, se muestra si es útil en la UI. */
  enGestion: Comparativa;
  cerrados: { total: Comparativa; venta: Comparativa; noVenta: Comparativa };
  tasaConversion: {
    actual: TasaConversionDetalle;
    anterior: TasaConversionDetalle;
    variacionPorcentual: number | null;
  };
  /**
   * `null` cuando no hay leads asignados en el rango. El backend no expone
   * el detalle por lead (`lead_eventos.ASIGNACION`/`CAMBIO_ETAPA`, M9) --
   * solo el promedio agregado.
   */
  tiempoPrimeraRespuesta: {
    horasPromedio: number | null;
    sinPrimeraRespuesta: number;
    anteriorHorasPromedio: number | null;
    variacionPorcentual: number | null;
  };
  /**
   * Solo etapa VENTA (docs/08 §2.6). El backend NO calcula un tiempo
   * promedio de cierre para No Venta -- gap frente al mock anterior, que sí
   * lo aproximaba; documentado en `docs/07-modulos-frontend.md` F5.
   */
  tiempoPromedioCierre: {
    diasPromedio: number | null;
    anteriorDiasPromedio: number | null;
    variacionPorcentual: number | null;
  };
  /**
   * Solo expone el porcentaje agregado -- a diferencia de `tasaConversion`,
   * el backend no devuelve aquí el numerador/denominador (`atendidosDentro24h`/
   * `totalAsignados`) en esta respuesta.
   */
  cumplimientoSla: {
    porcentaje: number | null;
    anteriorPorcentaje: number | null;
    variacionPorcentual: number | null;
  };
  /** 3.6 -- viene embebida acá, no como endpoint propio (a diferencia de lo que asumía el mock). */
  distribucionSemaforo: DistribucionSemaforo;
}

export interface MetricasPorRedSocial {
  redSocial: RedSocial;
  total: number;
  ventas: number;
  noVentas: number;
  /** `null` cuando no hay cerrados de esa red en el período (denominador 0). */
  tasaConversionPct: number | null;
}

export interface MetricasPorAsesor {
  responsableId: string;
  nombre: string;
  total: number;
  ventas: number;
  noVentas: number;
  tasaConversionPct: number | null;
  cumplimientoSlaPct: number | null;
}

/** `GET /metricas/por-etapa`: conteo plano por las 5 etapas, SIN orden de embudo ni % de caída -- endpoint distinto de `/embudo`. */
export interface MetricasPorEtapa {
  etapa: EtapaLead;
  total: number;
}

/** Paso del embudo real (`GET /metricas/embudo`, docs/08 §3.3). Solo NUEVO/CONTACTADO/CITA/VENTA -- NO_VENTA no es un paso. */
export interface EmbudoPaso {
  etapa: EtapaLead;
  total: number;
  /** % de caída respecto del paso anterior. `null` en el primer paso. */
  caidaPct: number | null;
}

export interface MetricasEmbudo {
  pasos: EmbudoPaso[];
  /** No Venta, mostrado aparte del embudo (docs/08 §3.3). */
  noVenta: number;
}

export interface MetricasPorCampania {
  nombreCampania: string;
  /** Puede ser `null` -- leads previos a M5 sin `redSocial` (mismo gap que `leads.api.ts::mapLeadFromApi`). */
  redSocial: RedSocial | null;
  total: number;
}

export interface RedSocialPorSemaforo {
  redSocial: RedSocial;
  total: number;
  rojo: number;
  amarillo: number;
  verde: number;
  sinCalificar: number;
  /** `null` cuando `total` de la red es 0. */
  pctVerde: number | null;
}

/**
 * `GET /metricas/embudo-oportunidad` (docs/23 item 13) -- ESTRUCTURALMENTE
 * IDÉNTICO a `MetricasEmbudo`: mismos 4 pasos NUEVO→CONTACTADO→CITA→VENTA
 * (`EmbudoPaso`, con `caidaPct`) y `noVenta` reportado aparte, pero medido
 * sobre `Oportunidad` en vez de `Lead`. Alias explícito (no un `type X =
 * MetricasEmbudo` anónimo importado como si nada) para que las firmas de
 * `metricas.api.ts`/`useMetricas.ts` dejen trazable qué fuente alimenta cada
 * gráfico.
 */
export type MetricasEmbudoOportunidad = MetricasEmbudo;

/**
 * `GET /metricas/por-producto` (docs/23 item 13). Ranking GLOBAL plano, NO
 * agrupado por empresa -- a diferencia de `RankingProductoPorEmpresa`, este
 * no trae `empresaId`/`nombreEmpresa`; el recorte a la empresa del caller ya
 * lo resuelve el backend de forma invisible.
 */
export interface MetricasPorProducto {
  productoId: string;
  nombreProducto: string;
  total: number;
  ventas: number;
  noVentas: number;
  /** `null` cuando no hay cerrados de ese producto en el período (denominador 0). */
  tasaConversionPct: number | null;
}

/**
 * `GET /metricas/cascada-lead-oportunidad` (docs/23 item 13) -- objeto
 * CRUDO, no una lista: 3 conteos de cohorte + 2 tasas. Cuenta leads que
 * ingresaron en el rango seleccionado y si alguna vez (sin un segundo filtro
 * de fecha sobre `Oportunidad`) llegaron a tener una oportunidad / cerraron
 * en venta. Distinto de `MetricasEmbudoOportunidad`: acá NO hay pasos
 * intermedios, es una vista compacta de apertura/cierre.
 */
export interface MetricasCascadaLeadOportunidad {
  leads: number;
  conOportunidad: number;
  ventaOportunidad: number;
  /** `null` cuando `leads` es 0. */
  tasaAperturaPct: number | null;
  /** `null` cuando `conOportunidad` es 0. */
  tasaCierrePct: number | null;
}

/**
 * `GET /metricas/ranking-productos-por-empresa` (docs/23 item 13). Lista
 * PLANA, una fila por par (empresa, producto) -- cada fila repite
 * `empresaId`/`nombreEmpresa`, sin recorte top-N por empresa (deliberado).
 * Ordenada por el backend por `nombreEmpresa` y luego `total` desc.
 *
 * GAP CONOCIDO (E5, `docs/blocks/e-dashboards.md`): hay un test de backend
 * fallando (`metricas.service.test.ts`, describe "getRankingProductosPorEmpresa
 * (E5)") donde una sesión holding-wide puede no ver la fila de una segunda
 * empresa. Se integra igual (decisión ya tomada, no ocultar la gráfica); el
 * aviso visible para sesión holding vive en
 * `GraficoRankingProductosPorEmpresa.tsx`.
 */
export interface MetricasRankingProductoPorEmpresa {
  empresaId: string;
  nombreEmpresa: string;
  productoId: string;
  nombreProducto: string;
  total: number;
  ventas: number;
  noVentas: number;
  /** `null` cuando no hay cerrados de ese par (empresa, producto) en el período (denominador 0). */
  tasaConversionPct: number | null;
}
