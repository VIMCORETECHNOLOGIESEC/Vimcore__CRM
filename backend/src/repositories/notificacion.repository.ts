import type { CanalNotificacion, Notificacion, RolUsuario, TipoNotificacion } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
import { condicionesMembresiaPorRol } from "../lib/rol-membresia.js";
export interface CreateNotificacionData {
  usuarioId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leadId?: string | null;
  /**
   * Bloque C (Etapa 3, D4 — RLS): `notificaciones.empresa_id` es nullable
   * (holding-wide, mismo convenio de `findActiveRecipientIds`) — omitido u
   * `undefined` deja la columna en NULL, sin cambio de comportamiento para
   * los call sites que todavía no resuelven una empresa.
   */
  empresaId?: string | null;
}
export async function createNotificacion(
  data: CreateNotificacionData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Notificacion> {
  return client.notificacion.create({ data });
}

/**
 * Fix bulk writes (`deactivateUsuario`, M2): variante en lote de
 * `createNotificacion` — un solo `createMany` para todas las notificaciones
 * de una reasignación de cartera masiva. A diferencia de la versión
 * singular, `id`/`canal`/`creadaEn` se generan en memoria (`crypto.randomUUID`,
 * mismo patrón que `auth.service.ts`) en vez de depender de los defaults de
 * Prisma — `createMany` no devuelve las filas insertadas. Si `data` está
 * vacío, no ejecuta ninguna consulta.
 */
export interface CreateNotificacionBulkData extends CreateNotificacionData {
  id: string;
  canal: CanalNotificacion;
  creadaEn: Date;
}
export async function createNotificaciones(
  data: readonly CreateNotificacionBulkData[],
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  if (data.length === 0) return;
  await client.notificacion.createMany({ data: [...data] });
}
export async function listByUsuario(
  usuarioId: string,
  soloNoLeidas: boolean,
  client: PrismaClientOrTransaction = prisma,
): Promise<Notificacion[]> {
  return client.notificacion.findMany({
    where: { usuarioId, ...(soloNoLeidas ? { leidaEn: null } : {}) },
    orderBy: { creadaEn: "desc" },
  });
}
export async function markOneRead(
  id: string,
  usuarioId: string,
  leidaEn: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<boolean> {
  const result = await client.notificacion.updateMany({
    where: { id, usuarioId },
    data: { leidaEn },
  });
  return result.count === 1;
}
export async function markAllRead(
  usuarioId: string,
  leidaEn: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.notificacion.updateMany({
    where: { usuarioId, leidaEn: null },
    data: { leidaEn },
  });
}
/**
 * Bloque C (D5, corrige el chokepoint de notificaciones nombrado en el
 * brief): reemplaza el scan global de `Usuario.rol` — que mezclaba
 * destinatarios de TODAS las empresas — por `Membresia` filtrada por
 * `empresaId` + rol equivalente. `empresaId === null` es el paso
 * holding-wide (mismo criterio D2 que
 * `shadow-authorization.service.ts::rolesEquivalentesActivos`), usado solo
 * por callers que legítimamente no resuelven una empresa en esta etapa
 * (Fase 1 / Stage 1). `Usuario.activo` se verifica vía el join de relación
 * existente — el schema de `Notificacion`/`Usuario` no cambia (D5).
 */
export async function findActiveRecipientIds(
  roles: readonly RolUsuario[],
  empresaId: string | null,
  client: PrismaClientOrTransaction = prisma,
): Promise<string[]> {
  const condicionesRol = condicionesMembresiaPorRol(roles);
  if (condicionesRol.length === 0) return [];

  const membresias = await client.membresia.findMany({
    where: {
      activa: true,
      usuario: { activo: true },
      ...(empresaId !== null ? { empresaId } : {}),
      OR: condicionesRol,
    },
    select: { usuarioId: true },
  });
  return [...new Set(membresias.map(({ usuarioId }) => usuarioId))];
}

export async function findActiveRecipientById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<{ id: string } | null> {
  return client.usuario.findFirst({ where: { id, activo: true }, select: { id: true } });
}
