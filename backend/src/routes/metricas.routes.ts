import { Router } from "express";
import {
  getMetricasEmbudo,
  getMetricasPorAsesor,
  getMetricasPorCampania,
  getMetricasPorEtapa,
  getMetricasPorRedSocial,
  getMetricasRedSocialXSemaforo,
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
metricasRouter.get("/metricas/embudo", requireAuthentication, getMetricasEmbudo);
metricasRouter.get(
  "/metricas/red-social-x-semaforo",
  requireAuthentication,
  getMetricasRedSocialXSemaforo,
);
