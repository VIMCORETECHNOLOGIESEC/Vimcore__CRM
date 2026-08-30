import type { Request, Response } from "express";
import { adaptGoogleForms } from "../adapters/google-forms.adapter.js";
import { AppError } from "../lib/app-error.js";
import { ingestaGenericaSchema } from "../schemas/ingesta.schema.js";
import { ingestarLead } from "../services/ingesta.service.js";

/**
 * Traducción HTTP pura (docs/05-bridges.md §5, diseño M4): Zod valida en el
 * borde (AGENTS.md §4.4, "nunca confiar en el payload de un webhook"), el
 * adaptador traduce a `LeadEntrante` usando el `bridge` que `requireBridgeKey`
 * (DD4) ya resolvió y adjuntó a `req`, y `ingestarLead` (PR3a) hace todo el
 * trabajo de negocio (transacción, dedupe, logging). Este archivo no
 * reimplementa autenticación, deduplicación ni atomicidad.
 */
export async function postIngestaGenerica(req: Request, res: Response): Promise<void> {
  const parsed = ingestaGenericaSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
  }

  if (!req.bridge) {
    // Invariante estructural, no alcanzable en producción: `requireBridgeKey`
    // siempre se monta antes de este controller y siempre asigna `req.bridge`
    // en su camino de éxito (`routes/ingesta.routes.ts`).
    throw new AppError("bridge_no_resuelto", 500, "El bridge autenticado no está disponible");
  }

  const entrada = adaptGoogleForms(parsed.data, req.bridge.id, req.bridge.redSocial);
  const resultado = await ingestarLead(entrada);

  res.status(200).json(resultado);
}
