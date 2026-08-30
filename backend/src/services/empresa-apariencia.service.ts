import { AppError } from "../lib/app-error.js";
import * as empresaRepository from "../repositories/empresa.repository.js";
import type {
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
): Promise<EmpresaAparienciaHoldingView> {
  const existente = await empresaRepository.findById(empresaId);
  if (!existente) {
    throw new AppError("empresa_no_encontrada", 404, "La empresa indicada no existe");
  }

  const actualizada = await empresaRepository.updateAparienciaHolding(empresaId, {
    nombre: input.nombre,
    colorPrimario: input.colorPrimario,
    colorSecundario: input.colorSecundario,
    logoUrl: input.logoUrl,
  });
  return toHoldingView(actualizada);
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
}): Promise<ListEmpresasResult> {
  const where = query.search
    ? { nombre: { contains: query.search, mode: "insensitive" as const } }
    : undefined;

  const { items, total } = await empresaRepository.findAll({
    where,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return { items, total };
}
