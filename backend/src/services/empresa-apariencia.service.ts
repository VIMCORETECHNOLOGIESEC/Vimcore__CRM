import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { uploadImage, type UploadImageInput } from "../lib/azure-blob-storage.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import type {
  CreateEmpresaBody,
  UpdateEmpresaAparienciaBody,
  UpdateEmpresaAparienciaHoldingBody,
} from "../schemas/empresa-apariencia.schema.js";

export interface EmpresaAparienciaView {
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}

function toView(empresa: {
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}): EmpresaAparienciaView {
  return {
    colorPrimario: empresa.colorPrimario,
    colorSecundario: empresa.colorSecundario,
    logoUrl: empresa.logoUrl,
  };
}

/**
 * `PATCH /empresas/actual/apariencia`: exclusivo ADMINISTRADOR de una sesión
 * `company` sobre SU PROPIA empresa (`requireRole` + guarda de
 * `sessionScope` en el controller). `empresaId` llega ya resuelto por
 * `requireAuthentication` -- este servicio nunca recibe ni confía en un
 * `empresaId` que venga del body/params/query (mismo principio D0/RLS del
 * resto del proyecto).
 */
export async function updateApariencia(
  empresaId: string,
  input: UpdateEmpresaAparienciaBody,
): Promise<EmpresaAparienciaView> {
  const actualizada = await empresaRepository.updateApariencia(empresaId, {
    colorPrimario: input.colorPrimario,
    colorSecundario: input.colorSecundario,
    logoUrl: input.logoUrl,
  });
  return toView(actualizada);
}

/**
 * `POST /empresas/actual/apariencia/logo`: mismo guard self-service que
 * `updateApariencia` arriba (guarda en el controller). Sube el archivo a
 * Azure Blob Storage y persiste solo `logoUrl` -- a propósito NO reusa
 * `updateApariencia` (que exige ambos colores completos en el body): este
 * flujo nunca conoce los colores actuales de la empresa, y forzarlos aquí
 * arriesgaría pisarlos con `null` en cada subida de logo.
 */
export async function uploadEmpresaLogo(
  empresaId: string,
  archivo: UploadImageInput,
): Promise<EmpresaAparienciaView> {
  const logoUrl = await uploadImage(archivo);
  const actualizada = await empresaRepository.updateLogo(empresaId, logoUrl);
  return toView(actualizada);
}

export interface EmpresaAparienciaHoldingView {
  id: string;
  nombre: string;
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}

function toHoldingView(empresa: {
  id: string;
  nombre: string;
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}): EmpresaAparienciaHoldingView {
  return {
    id: empresa.id,
    nombre: empresa.nombre,
    colorPrimario: empresa.colorPrimario,
    colorSecundario: empresa.colorSecundario,
    logoUrl: empresa.logoUrl,
  };
}

/**
 * holding-scoped-tenant-isolation: `empresas` has no RLS, so holding isolation
 * for this domain is enforced here. `holdingId: string` restricts every read,
 * write and create to that holding. `holdingId: null` is the existing global
 * path (SUPER_ADMIN, `{ unrestricted }` context): no filter.
 * TODO(open decision): legacy own-JWT ADMINISTRADOR/SUPERVISOR holding
 * sessions also arrive with `holdingId == null` and therefore stay
 * unrestricted until the product decision on those roles is made.
 */
export interface EmpresaScope {
  holdingId: string | null;
}

const UNRESTRICTED_SCOPE: EmpresaScope = { holdingId: null };

function isOutsideScope(empresa: { holdingId: string | null }, scope: EmpresaScope): boolean {
  return scope.holdingId !== null && empresa.holdingId !== scope.holdingId;
}

function empresaNoEncontrada(): AppError {
  return new AppError("empresa_no_encontrada", 404, "La empresa indicada no existe");
}

/**
 * tema-empresarial-integracion (PASO 8): admin cross-empresa, exclusivo
 * sessionScope `holding` (guard en el controller) -- a diferencia de
 * `updateApariencia` arriba, `empresaId` viene del `:param` de la URL, nunca
 * de la sesión, porque el propósito explícito es editar OTRA `Empresa`. 404
 * si no existe: a diferencia del self-service (cuyo id ya está garantizado
 * por una sesión autenticada contra esa fila), acá el id es arbitrario y
 * puede apuntar a una `Empresa` que no existe.
 */
export async function updateAparienciaHolding(
  empresaId: string,
  input: UpdateEmpresaAparienciaHoldingBody,
  scope: EmpresaScope = UNRESTRICTED_SCOPE,
): Promise<EmpresaAparienciaHoldingView> {
  const existente = await empresaRepository.findById(empresaId);
  // 404 (not 403) for another holding's empresa: do not leak its existence.
  if (!existente || isOutsideScope(existente, scope)) {
    throw empresaNoEncontrada();
  }

  const actualizada = await empresaRepository.updateAparienciaHolding(empresaId, {
    nombre: input.nombre,
    colorPrimario: input.colorPrimario,
    colorSecundario: input.colorSecundario,
    logoUrl: input.logoUrl,
  });
  return toHoldingView(actualizada);
}

/**
 * `GET /empresas/:empresaId` (gap reportado por frontend: `EmpresaDetallePage
 * .tsx` traía las 500 filas de `GET /empresas` y buscaba en memoria).
 * Exclusivo sessionScope `holding` (guard en el controller), mismo shape
 * `EmpresaAparienciaHoldingView` que el resto del módulo. 404 si no existe,
 * mismo criterio que `updateAparienciaHolding`: el id es arbitrario (viene
 * de la URL), puede apuntar a una `Empresa` que no existe.
 */
export async function getEmpresaHolding(
  empresaId: string,
  scope: EmpresaScope = UNRESTRICTED_SCOPE,
): Promise<EmpresaAparienciaHoldingView> {
  const existente = await empresaRepository.findById(empresaId);
  if (!existente || isOutsideScope(existente, scope)) {
    throw empresaNoEncontrada();
  }
  return toHoldingView(existente);
}

/**
 * `POST /empresas` (alta de empresa nueva): exclusivo sessionScope `holding`
 * (guard en el controller, mismo criterio que `GET /empresas`). Sin
 * auto-provisioning de `Membresia` -- ver el comentario de
 * `empresa.repository.ts::create` para la evidencia completa de por qué no
 * hace falta (`docs/blocks/f-retiro-legacy.md`, bypass por `Usuario.rol` ya
 * holding-wide sin depender de ninguna `Membresia`). Devuelve el mismo shape
 * `EmpresaAparienciaHoldingView` que el resto del módulo.
 */
export async function createEmpresa(
  input: CreateEmpresaBody,
  scope: EmpresaScope = UNRESTRICTED_SCOPE,
): Promise<EmpresaAparienciaHoldingView> {
  const creada = await empresaRepository.create({
    nombre: input.nombre,
    colorPrimario: input.colorPrimario,
    colorSecundario: input.colorSecundario,
    logoUrl: input.logoUrl,
    ...(scope.holdingId !== null ? { holdingId: scope.holdingId } : {}),
  });
  return toHoldingView(creada);
}

export interface ListEmpresasResult {
  items: EmpresaAparienciaHoldingView[];
  total: number;
}

/**
 * tema-empresarial-integracion (PASO 8, gap de gestor de empresas): listado
 * exclusivo sessionScope `holding` (guard en el controller) que alimenta la
 * pantalla "gestor de empresas" -- mismo shape que `EmpresaAparienciaHoldingView`
 * porque `empresa.repository.ts::findAll` ya selecciona exactamente esos
 * campos (`toHoldingView` no hace falta acá: no hay transformación de datos,
 * solo lectura acotada).
 *
 * Paginación + búsqueda (gap: 478 filas reales sin límite ni filtro, listado
 * ilegible) -- contrato fijo `{ items, total }` acordado con el frontend.
 * `search` sobre `nombre` con `mode: "insensitive"` explícito: `Empresa.nombre`
 * es `@db.Text` (NO `@db.Citext` -- verificado contra `schema.prisma`, citext
 * en este proyecto solo se usa en columnas `correo`), y de todas formas
 * `usuarios.service.ts::buildWhere` ya documenta que el `contains` de Prisma
 * sin `mode` no activa insensibilidad ni siquiera en columnas citext, así que
 * el `mode` explícito es obligatorio acá independientemente del tipo de
 * columna.
 */
export async function listEmpresas(query: {
  page: number;
  pageSize: number;
  search?: string;
}, scope: EmpresaScope = UNRESTRICTED_SCOPE): Promise<ListEmpresasResult> {
  const conditions: Prisma.EmpresaWhereInput[] = [];
  if (scope.holdingId !== null) {
    conditions.push({ holdingId: scope.holdingId });
  }
  if (query.search) {
    conditions.push({ nombre: { contains: query.search, mode: "insensitive" } });
  }
  const where: Prisma.EmpresaWhereInput | undefined =
    conditions.length > 0 ? { AND: conditions } : undefined;

  const { items, total } = await empresaRepository.findAll({
    where,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return { items, total };
}
