import type { Prisma, RolUsuario, TipoNotificacion } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
import * as notificationRepository from "../repositories/notificacion.repository.js";
export interface NotificationInput {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leadId?: string | null;
  /** Ver el comentario equivalente en `notificacion.repository.ts::CreateNotificacionData`. */
  metadata?: Prisma.InputJsonValue;
}
const UNASSIGNED_RECIPIENT_ROLES: readonly RolUsuario[] = ["SUPERVISOR", "ADMINISTRADOR"];
/**
 * Bloque C (D5): `empresaId` es un parámetro NUEVO, opcional (default
 * `null` = holding-wide) para no romper los call sites existentes que
 * todavía no resuelven una empresa en esta etapa (`asignacion.service.ts`,
 * `ingesta.service.ts` — fuera del alcance de Fase 1 / Stage 1, ver
 * `sdd/bloque-c-aislamiento`). Los 4 callers en alcance
 * (`bridge-log.service.ts`, `sla-atrasado.service.ts`,
 * `verificacion-token.service.ts`, y este mismo chokepoint) sí pasan el
 * `empresaId` real del recurso que disparó la notificación.
 */
export async function createForActiveRoles(
  roles: readonly RolUsuario[],
  input: NotificationInput,
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
) {
  if (!empresaId) {
    throw new AppError(
      "contexto_empresa_no_resuelto",
      422,
      "La notificación requiere una empresa de origen",
    );
  }
  const recipientIds = await notificationRepository.findActiveRecipientIds(roles, empresaId, client);
  const created = [];
  for (const usuarioId of recipientIds) {
    created.push(
      await notificationRepository.createNotificacion(
        { usuarioId, ...input, empresaId },
        client,
      ),
    );
  }
  return created;
}

export async function createHoldingForActiveRoles(
  roles: readonly RolUsuario[],
  input: NotificationInput,
  client: PrismaClientOrTransaction = prisma,
) {
  const recipientIds = await notificationRepository.findActiveRecipientIds(roles, null, client);
  const created = [];
  for (const usuarioId of recipientIds) {
    created.push(
      await notificationRepository.createNotificacion(
        { usuarioId, ...input, empresaId: null },
        client,
      ),
    );
  }
  return created;
}
export async function listNotifications(usuarioId: string, soloNoLeidas: boolean) {
  return notificationRepository.listByUsuario(usuarioId, soloNoLeidas);
}
export async function markNotificationRead(id: string, usuarioId: string): Promise<void> {
  const found = await notificationRepository.markOneRead(id, usuarioId, new Date());
  if (!found) {
    throw new AppError("notificacion_no_encontrada", 404, "Notificación no encontrada");
  }
}
export async function markAllNotificationsRead(usuarioId: string): Promise<void> {
  await notificationRepository.markAllRead(usuarioId, new Date());
}
const RECURSO_FALTANTE_TITULOS = {
  canal: "Falta un canal activo",
  producto: "Falta un producto activo",
} as const;
export interface CanalOProductoFaltanteInput {
  recurso: "canal" | "producto";
  nombreSugerido: string;
  mensaje?: string;
  metadata?: Record<string, unknown>;
}
/**
 * Pre-deploy (endpoint manual de aviso Supervisor/Asesor → Administrador):
 * el frontend ya bloquea la carga de un lead sin canal/producto activo, esto
 * le da al Supervisor/Asesor una forma de avisarle al Administrador de su
 * propia empresa. `empresaId` viene SIEMPRE de la sesión autenticada
 * (nunca del body) — si es `null` (alcance holding-wide), delega en el
 * mismo guard de `createForActiveRoles` (`contexto_empresa_no_resuelto`,
 * 422) en vez de asumir una empresa.
 */
export async function createCanalOProductoFaltanteNotification(
  input: CanalOProductoFaltanteInput,
  empresaId: string | null,
  client: PrismaClientOrTransaction = prisma,
) {
  const titulo = RECURSO_FALTANTE_TITULOS[input.recurso];
  const mensaje =
    input.mensaje ??
    `Un asesor necesita cargar un lead pero no hay ${input.recurso} activo con nombre sugerido "${input.nombreSugerido}".`;
  const metadata: Prisma.InputJsonValue = {
    recurso: input.recurso,
    nombreSugerido: input.nombreSugerido,
    ...(input.metadata ?? {}),
  };
  return createForActiveRoles(
    ["ADMINISTRADOR"],
    { tipo: "CANAL_O_PRODUCTO_FALTANTE", titulo, mensaje, metadata },
    empresaId as string,
    client,
  );
}
export async function createForActiveSupervisorsAndAdmins(
  input: NotificationInput,
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
) {
  if (!empresaId) {
    throw new AppError(
      "contexto_empresa_no_resuelto",
      422,
      "La notificación requiere una empresa de origen",
    );
  }
  const recipientIds = await notificationRepository.findActiveRecipientIds(
    UNASSIGNED_RECIPIENT_ROLES,
    empresaId,
    client,
  );
  const created = [];
  for (const usuarioId of recipientIds) {
    created.push(
      await notificationRepository.createNotificacion(
        { usuarioId, ...input, empresaId },
        client,
      ),
    );
  }
  return created;
}
