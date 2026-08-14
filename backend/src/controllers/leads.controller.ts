import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { idParamSchema, listLeadsQuerySchema, patchEtapaBodySchema } from "../schemas/leads.schema.js";
import { findLeadById, findLeads, transitionEtapa } from "../services/leads.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/**
 * Traducción HTTP pura (mismo patrón que `usuarios.controller.ts`): Zod
 * valida en el borde, `leads.service.ts` hace todo el trabajo de negocio
 * (filtro de rol, D4/D5, transacción). Este archivo no reimplementa
 * autorización ni reglas de negocio.
 */
export async function getLeads(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsed = listLeadsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw zodValidationError();

  const resultado = await findLeads(usuario, parsed.data);
  res.status(200).json(resultado);
}

export async function getLeadById(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const lead = await findLeadById(usuario, parsedId.data.id);
  res.status(200).json({ lead });
}

export async function patchLeadEtapa(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = patchEtapaBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const lead = await transitionEtapa(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ lead });
}
