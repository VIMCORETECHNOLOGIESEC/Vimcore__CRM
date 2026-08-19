import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { metricasQuerySchema } from "../schemas/metricas.schema.js";
import {
  getEmbudo,
  getPorAsesor,
  getPorCampania,
  getPorEtapa,
  getPorRedSocial,
  getRedSocialXSemaforo,
  getResumen,
} from "../services/metricas.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/**
 * Traducción HTTP pura (mismo patrón que `leads.controller.ts`): un único
 * `metricasQuerySchema` reusado por los 7 endpoints — el alcance por rol y
 * toda la agregación viven en `metricas.service.ts`.
 */
function parseQuery(req: Request): ReturnType<typeof metricasQuerySchema.parse> {
  const parsed = metricasQuerySchema.safeParse(req.query);
  if (!parsed.success) throw zodValidationError();
  return parsed.data;
}

export async function getMetricasResumen(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const query = parseQuery(req);
  const resultado = await getResumen(usuario, query);
  res.status(200).json(resultado);
}

export async function getMetricasPorRedSocial(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const query = parseQuery(req);
  const resultado = await getPorRedSocial(usuario, query);
  res.status(200).json({ items: resultado });
}

export async function getMetricasPorAsesor(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const query = parseQuery(req);
  const resultado = await getPorAsesor(usuario, query);
  res.status(200).json({ items: resultado });
}

export async function getMetricasPorEtapa(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const query = parseQuery(req);
  const resultado = await getPorEtapa(usuario, query);
  res.status(200).json({ items: resultado });
}

export async function getMetricasPorCampania(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const query = parseQuery(req);
  const resultado = await getPorCampania(usuario, query);
  res.status(200).json({ items: resultado });
}

export async function getMetricasEmbudo(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const query = parseQuery(req);
  const resultado = await getEmbudo(usuario, query);
  res.status(200).json(resultado);
}

export async function getMetricasRedSocialXSemaforo(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);
  const query = parseQuery(req);
  const resultado = await getRedSocialXSemaforo(usuario, query);
  res.status(200).json({ items: resultado });
}
