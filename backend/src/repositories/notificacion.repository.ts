import type { CanalNotificacion, Notificacion, Prisma, RolUsuario, TipoNotificacion } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
export interface CreateNotificacionData {
  usuarioId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leadId?: string | null;
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
export async function findActiveRecipientIds(
  roles: readonly RolUsuario[],
  client: PrismaClientOrTransaction = prisma,
): Promise<string[]> {
  const users = await client.usuario.findMany({
    where: { activo: true, rol: { in: [...roles] } },
    select: { id: true },
  });
  return users.map(({ id }) => id);
}

export async function findActiveRecipientById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<{ id: string } | null> {
  return client.usuario.findFirst({ where: { id, activo: true }, select: { id: true } });
}
