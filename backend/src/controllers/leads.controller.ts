import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import {
  asignarBodySchema,
  asignarLoteBodySchema,
  idParamSchema,
  listLeadsQuerySchema,
  patchEtapaBodySchema,
  postFormularioBodySchema,
  reasignarBodySchema,
  traspasarBodySchema,
} from "../schemas/leads.schema.js";
import { assignLead, assignLeadsBatch, reassignLead, transferLead } from "../services/asignacion.service.js";
import { findLeadById, findLeads, recalificarLead, transitionEtapa } from "../services/leads.service.js";

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

export async function postLeadFormulario(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = postFormularioBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const lead = await recalificarLead(usuario, parsedId.data.id, parsedBody.data.respuestas);
  res.status(200).json({ lead });
}

/** M6 (diseño): calco de `patchLeadEtapa` — traducción HTTP pura, cero reglas de negocio aquí. */
export async function postLeadAsignar(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = asignarBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const lead = await assignLead(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ lead });
}

/**
 * `POST /api/v1/leads/asignar-lote` (diseño D-A1): calco de `postLeadAsignar`
 * — traducción HTTP pura. Siempre 200 si el request pasó Zod: el reporte por
 * lead (`exitosos`/`fallidos`) NO es all-or-nothing, así que un fallo
 * individual no cambia el código HTTP del batch.
 */
export async function postLeadsAsignarLote(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedBody = asignarLoteBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const resultado = await assignLeadsBatch(usuario, parsedBody.data);
  res.status(200).json(resultado);
}

export async function postLeadReasignar(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = reasignarBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const lead = await reassignLead(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ lead });
}

export async function postLeadTraspasar(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = traspasarBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const lead = await transferLead(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ lead });
}
