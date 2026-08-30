import { Router } from "express";
import {
  getMetricasCascadaLeadOportunidad,
  getMetricasEmbudo,
  getMetricasEmbudoOportunidad,
  getMetricasPorAsesor,
  getMetricasPorCampania,
  getMetricasPorEtapa,
  getMetricasPorHabilitadoParaVenta,
  getMetricasPorProducto,
  getMetricasPorRedSocial,
  getMetricasRankingProductosPorEmpresa,
  getMetricasRedSocialXSemaforo,
  getMetricasRendimientoCampanias,
  getMetricasResumen,
} from "../controllers/metricas.controller.js";
import { requireAuthentication } from "../middlewares/require-authentication.middleware.js";

export const metricasRouter = Router();

// docs/08 §1: el alcance por rol NO es `requireRole` fijo — general para
// Admin/Supervisor, acotado a sí mismo para Asesor/Vendedor — igual que
// `GET /leads` (DD5, M5): cualquier rol autenticado puede llamar, el
// servicio filtra. `/por-asesor` es la única excepción (docs/08 §3.2,
// "visible solo para administrador y supervisor") y esa restricción vive en
// `metricas.service.ts::getPorAsesor` (403), no en middleware — mismo
// criterio de autorización por regla de negocio que el resto de este router.
metricasRouter.get("/metricas/resumen", requireAuthentication, getMetricasResumen);
metricasRouter.get("/metricas/por-red-social", requireAuthentication, getMetricasPorRedSocial);
metricasRouter.get("/metricas/por-asesor", requireAuthentication, getMetricasPorAsesor);
metricasRouter.get("/metricas/por-etapa", requireAuthentication, getMetricasPorEtapa);
metricasRouter.get("/metricas/por-campania", requireAuthentication, getMetricasPorCampania);
metricasRouter.get("/metricas/rendimiento-campanias", requireAuthentication, getMetricasRendimientoCampanias);
metricasRouter.get("/metricas/embudo", requireAuthentication, getMetricasEmbudo);
metricasRouter.get(
  "/metricas/red-social-x-semaforo",
  requireAuthentication,
  getMetricasRedSocialXSemaforo,
);

// Extensiones de dashboard (Bloque E, docs/blocks/e-dashboards.md
// "Extensiones de dashboard"): mismo criterio de autorización que arriba —
// cualquier rol autenticado puede llamar, el servicio filtra por alcance;
// `/por-habilitado-para-venta` es la excepción (403 en el servicio, mismo
// patrón que `/por-asesor`).
metricasRouter.get("/metricas/embudo-oportunidad", requireAuthentication, getMetricasEmbudoOportunidad);
metricasRouter.get("/metricas/por-producto", requireAuthentication, getMetricasPorProducto);
metricasRouter.get(
  "/metricas/cascada-lead-oportunidad",
  requireAuthentication,
  getMetricasCascadaLeadOportunidad,
);
metricasRouter.get(
  "/metricas/por-habilitado-para-venta",
  requireAuthentication,
  getMetricasPorHabilitadoParaVenta,
);
metricasRouter.get(
  "/metricas/ranking-productos-por-empresa",
  requireAuthentication,
  getMetricasRankingProductosPorEmpresa,
);
