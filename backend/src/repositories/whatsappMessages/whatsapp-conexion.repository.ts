import { Prisma, type WhatsAppConexion } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

const WHATSAPP_CONEXION_SAFE_SELECT = {
  id: true,
  empresaId: true,
  numeroTelefonoId: true,
  numeroDisplay: true,
  wabaId: true,
  estado: true,
  creadoEn: true,
} satisfies Prisma.WhatsAppConexionSelect;

export type WhatsAppConexionSafe = Prisma.WhatsAppConexionGetPayload<{
  select: typeof WHATSAPP_CONEXION_SAFE_SELECT;
}>;

/** Proyección segura — nunca expone `tokenCifrado`, mismo criterio que `LinkedInConexionSafe`. */
export async function findByEmpresaId(
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<WhatsAppConexionSafe | null> {
  return client.whatsAppConexion.findUnique({
    where: { empresaId },
    select: WHATSAPP_CONEXION_SAFE_SELECT,
  });
}

/**
 * Resuelve la `WhatsAppConexion` dueña de un `numero_telefono_id` reportado
 * por el webhook — necesario para saber a qué `empresaId` pertenece un
 * mensaje entrante ANTES de que exista ningún `TenantContext` de request
 * (mismo problema estructural que `cuentaPublicitariaRepository.
 * findByIdExternoConBridge` para el webhook de Meta Ads).
 */
export async function findByNumeroTelefonoId(
  numeroTelefonoId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<WhatsAppConexion | null> {
  return client.whatsAppConexion.findUnique({ where: { numeroTelefonoId } });
}

/** Uso interno exclusivo de servicios que deben llamar a la Cloud API (envío de mensajes). */
export async function findWithToken(
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<WhatsAppConexion | null> {
  return client.whatsAppConexion.findUnique({ where: { empresaId } });
}

export interface UpsertConexionData {
  empresaId: string;
  numeroTelefonoId: string;
  numeroDisplay: string;
  wabaId: string;
  tokenCifrado: string;
  tokenExpiraEn: Date | null;
}

/**
 * Un solo número por empresa (`empresaId` es `@unique` en el schema) —
 * `upsert` por `empresaId` cubre tanto la primera conexión como reconectar
 * un número distinto más adelante (D-mensajería, "un solo número vigente").
 */
export async function upsertConexion(
  data: UpsertConexionData,
  client: PrismaClientOrTransaction = prisma,
): Promise<WhatsAppConexionSafe> {
  const tokenData = {
    numeroTelefonoId: data.numeroTelefonoId,
    numeroDisplay: data.numeroDisplay,
    wabaId: data.wabaId,
    tokenCifrado: data.tokenCifrado,
    tokenExpiraEn: data.tokenExpiraEn,
    estado: "ACTIVA" as const,
  };
  return client.whatsAppConexion.upsert({
    where: { empresaId: data.empresaId },
    create: { empresaId: data.empresaId, ...tokenData },
    update: tokenData,
    select: WHATSAPP_CONEXION_SAFE_SELECT,
  });
}

export async function markEstado(
  id: string,
  estado: WhatsAppConexion["estado"],
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.whatsAppConexion.update({ where: { id }, data: { estado } });
}
