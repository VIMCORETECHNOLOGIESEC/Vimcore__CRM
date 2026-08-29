import type { Request, Response } from "express";
import { AppError } from "../../lib/app-error.js";
import { assertAuthenticated } from "../../lib/assert-authenticated.js";
import {
  cerrarOportunidadBodySchema,
  crearOportunidadBodySchema,
  idParamSchema,
  listOportunidadesQuerySchema,
  patchOportunidadEtapaBodySchema,
  reasignarOportunidadBodySchema,
} from "../../schemas/negociacion/oportunidad.schema.js";
import {
  cambiarEtapaOportunidad,
  cerrarOportunidad,
  crearOportunidad,
  listarOportunidades,
  obtenerOportunidad,
  reasignarOportunidadExcepcion,
} from "../../services/negociacion/oportunidad.service.js";

/**
 * negociacion (Bloque D): traducción HTTP pura -- mismo patrón que
 * `leads.controller.ts`/`conversaciones.controller.ts`. Ninguna regla de
 * negocio ni autorización vive en este archivo, todo en
 * `oportunidad.service.ts`/`oportunidad.access.ts`.
 */
function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "La petición es inválida");
}

export async function postOportunidad(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedBody = crearOportunidadBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const oportunidad = await crearOportunidad(usuario, parsedBody.data);
  res.status(201).json({ oportunidad });
}

export async function getOportunidades(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedQuery = listOportunidadesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) throw zodValidationError();

  const resultado = await listarOportunidades(usuario, parsedQuery.data);
  res.status(200).json(resultado);
}

export async function getOportunidadById(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const oportunidad = await obtenerOportunidad(usuario, parsedId.data.id);
  res.status(200).json({ oportunidad });
}

export async function patchOportunidadEtapa(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = patchOportunidadEtapaBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const oportunidad = await cambiarEtapaOportunidad(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ oportunidad });
}

export async function postOportunidadCerrar(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = cerrarOportunidadBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const oportunidad = await cerrarOportunidad(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ oportunidad });
}

export async function postOportunidadReasignar(req: Request, res: Response): Promise<void> {
  const usuario = assertAuthenticated(req);

  const parsedId = idParamSchema.safeParse(req.params);
  if (!parsedId.success) throw zodValidationError();

  const parsedBody = reasignarOportunidadBodySchema.safeParse(req.body);
  if (!parsedBody.success) throw zodValidationError();

  const oportunidad = await reasignarOportunidadExcepcion(usuario, parsedId.data.id, parsedBody.data);
  res.status(200).json({ oportunidad });
}
