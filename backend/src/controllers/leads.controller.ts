import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import {
  asignarBodySchema,
  asignarLoteBodySchema,
  cargaMasivaLeadsBodySchema,
  crearLeadManualBodySchema,
  idParamSchema,
  listLeadsQuerySchema,
  patchEtapaBodySchema,
  postFormularioBodySchema,
  reasignarBodySchema,
  traspasarBodySchema,
} from "../schemas/leads.schema.js";
import { assignLead, assignLeadsBatch, reassignLead, transferLead } from "../services/asignacion.service.js";
import { crearLeadManual, crearLeadsManualEnLote } from "../services/leads-manual.service.js";
import {
  findLeadById,
  findLeads,
  listRedesSocialesVisibles,
  recalificarLead,
  transitionEtapa,
} from "../services/leads.service.js";

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

/**
 * `GET /leads/catalogo/redes-sociales`: catálogo de redes sociales, acotado
 * al rol del usuario y en cascada con los demás filtros activos de `/leads`
 * (reutiliza `listLeadsQuerySchema` — los campos de paginación que no aplican
 * al catálogo simplemente se ignoran en `buildWhere`). Sin `requireRole`: el
 * scoping por rol de `buildWhere` ya es la autorización, mismo principio que
 * `getLeads`.
 */
export async function getLeadsRedesSociales(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsed = listLeadsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw zodValidationError();

  const redesSociales = await listRedesSocialesVisibles(usuario, parsed.data);
  res.status(200).json({ redesSociales });
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

/**
 * `POST /leads` (Bloque D, "Canal de ingreso manual y catálogo dinámico"):
 * traducción HTTP pura -- `leads-manual.service.ts::crearLeadManual` hace
 * todo el trabajo de negocio (rol, resolución de empresa, dedup D2,
 * auto-assignment D3). 201 si `deduplicateLead` creó un lead nuevo; 200 si
 * ancló el evento a un lead existente (duplicado) -- mismo criterio que
 * `deduplicateLead` ya expone vía `leadCreado`, sin inventar un tercer
 * estado nuevo (la ingesta vía webhook nunca devuelve esto de forma
 * síncrona al llamador HTTP, así que no hay un precedente propio que
 * replicar más allá de este campo).
 */
export async function postLead(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedBody = crearLeadManualBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const resultado = await crearLeadManual(usuario, parsedBody.data);
  res.status(resultado.duplicado ? 200 : 201).json({ lead: resultado.lead });
}

/**
 * `POST /leads/carga-masiva` (aditivo, contrato JSON ya comunicado a
 * frontend): calco de `postLeadsAsignarLote` -- siempre 200 si el request
 * pasó Zod; el reporte por fila no es all-or-nothing.
 */
export async function postLeadsCargaMasiva(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedBody = cargaMasivaLeadsBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const resultado = await crearLeadsManualEnLote(usuario, parsedBody.data);
  res.status(200).json(resultado);
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
