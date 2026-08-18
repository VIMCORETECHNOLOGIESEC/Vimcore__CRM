import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import { assertAuthenticated } from "../lib/assert-authenticated.js";
import { idParamSchema } from "../schemas/leads.schema.js";
import {
  citaIdParamSchema,
  crearCitaBodySchema,
  marcarResultadoCitaBodySchema,
  reprogramarCitaBodySchema,
} from "../schemas/citas.schema.js";
import {
  cancelCita,
  getCitaById,
  listCitasByLead,
  marcarResultadoCita,
  rescheduleCita,
  scheduleCita,
} from "../services/citas.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

/**
 * Traducción HTTP pura (mismo patrón que `leads.controller.ts`): Zod valida
 * en el borde, `citas.service.ts` hace todo el trabajo de negocio
 * (autorización por recurso, validación de fecha futura, transacción).
 */
export async function postCita(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = crearCitaBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const cita = await scheduleCita(usuario, parsedId.data.id, parsedBody.data);
  res.status(201).json({ cita });
}

export async function getCitasPorLead(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const citas = await listCitasByLead(usuario, parsedId.data.id);
  res.status(200).json({ citas });
}

export async function getCita(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = citaIdParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const cita = await getCitaById(usuario, parsedId.data.citaId);
  res.status(200).json({ cita });
}

export async function postCancelarCita(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = citaIdParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const cita = await cancelCita(usuario, parsedId.data.citaId);
  res.status(200).json({ cita });
}

export async function postReprogramarCita(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = citaIdParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = reprogramarCitaBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const cita = await rescheduleCita(usuario, parsedId.data.citaId, parsedBody.data);
  res.status(200).json({ cita });
}

export async function postResultadoCita(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = citaIdParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = marcarResultadoCitaBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const cita = await marcarResultadoCita(usuario, parsedId.data.citaId, parsedBody.data);
  res.status(200).json({ cita });
}
