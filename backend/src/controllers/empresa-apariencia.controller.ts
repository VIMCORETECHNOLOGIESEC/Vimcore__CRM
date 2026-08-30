import type { Request, Response } from "express";
import { AppError } from "../lib/app-error.js";
import {
  empresaIdParamSchema,
  listEmpresasQuerySchema,
  updateEmpresaAparienciaBodySchema,
  updateEmpresaAparienciaHoldingBodySchema,
} from "../schemas/empresa-apariencia.schema.js";
import {
  listEmpresas,
  updateApariencia,
  updateAparienciaHolding,
  uploadEmpresaLogo,
} from "../services/empresa-apariencia.service.js";

function zodValidationError(): AppError {
  return new AppError("validacion_invalida", 400, "El cuerpo de la petición es inválido");
}

/**
 * Guarda adicional (Tarea 3, más allá de `requireRole("ADMINISTRADOR")` en
 * la ruta): este endpoint es exclusivamente self-service, para el
 * ADMINISTRADOR de UNA empresa sobre la SUYA -- una sesión `holding` (aunque
 * tenga rol ADMINISTRADOR holding-wide) no tiene una única empresa propia
 * que editar. 403, no 401: la sesión sí está autenticada y autorizada por
 * rol, solo le falta el scope correcto para esta acción puntual.
 */
function forbiddenCompanyScope(): AppError {
  return new AppError(
    "solo_empresa_propia",
    403,
    "Esta acción es exclusiva del administrador de una empresa sobre su propia apariencia",
  );
}

export async function patchEmpresaApariencia(req: Request, res: Response): Promise<void> {
  if (!req.user || req.user.sessionScope !== "company" || req.user.empresaId === null) {
    throw forbiddenCompanyScope();
  }

  const parsed = updateEmpresaAparienciaBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw zodValidationError();
  }

  // `req.user.empresaId` -- NUNCA `req.body.empresaId` -- es la única fuente
  // de autoridad para qué `Empresa` se modifica (D0/RLS, mismo principio que
  // el resto del proyecto).
  const apariencia = await updateApariencia(req.user.empresaId, parsed.data);
  res.status(200).json(apariencia);
}

function archivoFaltante(): AppError {
  return new AppError(
    "archivo_faltante",
    400,
    "Debes adjuntar un archivo de imagen en el campo 'logo'",
  );
}

/**
 * `POST /empresas/actual/apariencia/logo`: mismo guard self-service que
 * `patchEmpresaApariencia` de arriba -- ADMINISTRADOR de una sesión
 * `company` sobre SU PROPIA empresa. `req.file` lo puebla
 * `uploadLogoMiddleware` (Multer, `memoryStorage`) antes de llegar acá; su
 * ausencia significa que el cliente no adjuntó ningún archivo en el campo
 * `logo` (a diferencia de un archivo de tipo/tamaño inválido, que
 * `uploadLogoMiddleware` ya rechaza con su propio `AppError` antes de que el
 * controller se ejecute).
 */
export async function postEmpresaAparienciaLogo(req: Request, res: Response): Promise<void> {
  if (!req.user || req.user.sessionScope !== "company" || req.user.empresaId === null) {
    throw soloEmpresaPropia();
  }

  if (!req.file) {
    throw archivoFaltante();
  }

  const apariencia = await uploadEmpresaLogo(req.user.empresaId, {
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });
  res.status(200).json(apariencia);
}

/**
 * Guarda adicional (PASO 8, más allá de `requireRole("ADMINISTRADOR")` en la
 * ruta): este endpoint es exclusivamente para sesiones `holding` -- guard
 * propio, separado de `forbiddenCompanyScope` de arriba (esa función exige
 * exactamente lo opuesto: sesión `company`). 403, no 401: la sesión sí está
 * autenticada y autorizada por rol, solo le falta el scope correcto para
 * esta acción puntual.
 */
export function forbiddenSessionScope(): AppError {
  return new AppError(
    "solo_sesion_holding",
    403,
    "Esta acción es exclusiva de una sesión de holding",
  );
}

function invalidIdParam(): AppError {
  return new AppError("validacion_invalida", 400, "El identificador de la empresa es inválido");
}

export async function patchEmpresaAparienciaHolding(req: Request, res: Response): Promise<void> {
  if (!req.user || req.user.sessionScope !== "holding") {
    throw forbiddenSessionScope();
  }

  const parsedParams = empresaIdParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    throw invalidIdParam();
  }

  const parsedBody = updateEmpresaAparienciaHoldingBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    throw zodValidationError();
  }

  // `req.params.empresaId` -- NUNCA `req.body.empresaId` -- identifica la
  // `Empresa` a editar. A diferencia del self-service de arriba, acá el id
  // SÍ viene de la URL en vez de la sesión: es intencionalmente cross-empresa
  // (D0, excepción explícita PASO 8).
  const apariencia = await updateAparienciaHolding(parsedParams.data.empresaId, parsedBody.data);
  res.status(200).json(apariencia);
}

/**
 * `GET /empresas` (PASO 8, gap de gestor de empresas): reusa
 * `forbiddenSessionScope` de arriba -- misma semántica de autorización que el
 * PATCH cross-empresa, sin guard nuevo. Sin :params ni body, pero SÍ valida
 * query (`page`/`pageSize`/`search`) -- gap de paginación: 478 filas reales
 * de `Empresa` sin límite ni filtro en este entorno, listado ilegible para el
 * admin de holding.
 */
export async function getEmpresas(req: Request, res: Response): Promise<void> {
  if (!req.user || req.user.sessionScope !== "holding") {
    throw forbiddenSessionScope();
  }

  const parsedQuery = listEmpresasQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    throw zodValidationError();
  }

  const resultado = await listEmpresas(parsedQuery.data);
  res.status(200).json(resultado);
}
