import type { Empresa } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * Bloque D0 (docs/blocks/d0-visualizacion-multitenant.md, "Extensión mínima
 * de GET /auth/perfil"): única lectura que necesita `auth.service.ts` (vía
 * `resolveEmpresaMarca`) para resolver `empresaNombre` de una sesión
 * `company`. `empresas` NO tiene RLS (es la tabla que define la frontera
 * tenant, no una tabla scopeada por tenant) — esta lectura por PK no
 * requiere ningún `TenantContext`/GUC activo.
 *
 * tema-empresarial-integracion (Parte 2): sin `select` explícito, así que ya
 * devuelve `colorPrimario`/`colorSecundario` (nullable) junto con el resto
 * de la fila — no hizo falta ampliar la consulta, solo el modelo Prisma.
 */
export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Empresa | null> {
  return client.empresa.findUnique({ where: { id } });
}

export interface UpdateEmpresaAparienciaData {
  colorPrimario: string | null;
  colorSecundario: string | null;
  // Opcional (a diferencia de los dos colores arriba): `undefined` (campo no
  // enviado en el PATCH) deja el isotipo sin tocar -- Prisma omite del
  // `data` cualquier clave con valor `undefined`. `null` explícito sí
  // restaura "sin isotipo".
  logoUrl?: string | null;
}

/**
 * tema-empresarial-integracion (Tarea 3): única escritura de
 * `colorPrimario`/`colorSecundario` -- antes de este cambio ningún endpoint
 * modificaba estos campos (solo lectura vía `findById` y siembra vía
 * `seed.ts`). `id` siempre es el `empresaId` YA resuelto por
 * `requireAuthentication` (nunca un valor del cliente) -- ver
 * `services/empresa-apariencia.service.ts`.
 */
export async function updateApariencia(
  id: string,
  data: UpdateEmpresaAparienciaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Empresa> {
  return client.empresa.update({ where: { id }, data });
}

export interface UpdateEmpresaAparienciaHoldingData {
  nombre?: string;
  colorPrimario?: string | null;
  colorSecundario?: string | null;
  logoUrl?: string | null;
}

/**
 * tema-empresarial-integracion (PASO 8): admin cross-empresa, exclusivo
 * sessionScope `holding` (`services/empresa-apariencia.service.ts::
 * updateAparienciaHolding`) -- separada de `updateApariencia` arriba a
 * propósito: ese caso de uso exige ambos colores completos en cada PATCH,
 * este es parcial y además escribe `nombre`. `id` viene del `:empresaId` de
 * la URL (nunca del body/sesión) -- mecánica pura de Prisma, la autoridad
 * (guard `sessionScope === "holding"`) vive en el controller, nunca acá.
 */
export async function updateAparienciaHolding(
  id: string,
  data: UpdateEmpresaAparienciaHoldingData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Empresa> {
  return client.empresa.update({ where: { id }, data });
}

/**
 * `POST /empresas/actual/apariencia/logo` (subida de isotipo por Azure Blob
 * Storage): a diferencia de `updateApariencia` arriba, esta escritura toca
 * SOLO `logoUrl` -- los dos colores no se conocen en este flujo (el
 * controller nunca los recibe, la request es multipart con un único campo de
 * archivo) y forzarlos aquí correría el riesgo real de pisarlos con `null`
 * en cualquier futuro refactor que reintroduzca el shape completo de
 * `UpdateEmpresaAparienciaData`. `id` siempre es el `empresaId` ya resuelto
 * por `requireAuthentication` (nunca un valor del cliente), mismo criterio
 * que `updateApariencia`.
 */
export async function updateLogo(
  id: string,
  logoUrl: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Empresa> {
  return client.empresa.update({ where: { id }, data: { logoUrl } });
}

export interface EmpresaListItem {
  id: string;
  nombre: string;
  colorPrimario: string | null;
  colorSecundario: string | null;
  logoUrl: string | null;
}

/**
 * tema-empresarial-integracion (PASO 8, gap de gestor de empresas): listado
 * completo de `Empresa` para `GET /empresas` -- exclusivo sessionScope
 * `holding` (guard en el controller, nunca acá). `empresas` NO tiene RLS
 * (mismo comentario que `findById`), así que esta lectura no requiere
 * `TenantContext`. `select` explícito para no filtrar campos de otros
 * módulos (leads/usuarios/bridges no viven en esta tabla, pero cualquier
 * columna futura de `Empresa` ajena a apariencia tampoco debe filtrarse acá
 * sin decisión explícita). Orden estable por `nombre` para que el listado no
 * dependa del orden de inserción.
 */
export async function findAll(
  client: PrismaClientOrTransaction = prisma,
): Promise<EmpresaListItem[]> {
  return client.empresa.findMany({
    select: { id: true, nombre: true, colorPrimario: true, colorSecundario: true, logoUrl: true },
    orderBy: { nombre: "asc" },
  });
}
