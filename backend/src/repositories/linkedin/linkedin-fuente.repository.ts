import {
  Prisma,
  type EstadoSuscripcionLinkedIn,
  type TipoFuenteLinkedIn,
  type TipoLeadLinkedIn,
} from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

const LINKEDIN_FUENTE_SAFE_SELECT = {
  id: true,
  tipo: true,
  ownerUrn: true,
  nombre: true,
  tipoLead: true,
  activa: true,
  estadoSuscripcion: true,
  ultimaSincronizacionEn: true,
} satisfies Prisma.LinkedInFuenteSelect;

const LINKEDIN_FUENTE_CONTEXT_SELECT = {
  ...LINKEDIN_FUENTE_SAFE_SELECT,
  conexionId: true,
  conexion: { select: { bridgeId: true } },
} satisfies Prisma.LinkedInFuenteSelect;

// Uso exclusivo de `linkedin-subscription.service.ts`: necesita `subscriptionId`
// para poder desuscribir en LinkedIn al desactivar. Nunca debe cruzar hacia un
// DTO HTTP — por eso vive separado de `LINKEDIN_FUENTE_SAFE_SELECT`.
const LINKEDIN_FUENTE_INTERNAL_SELECT = {
  ...LINKEDIN_FUENTE_SAFE_SELECT,
  subscriptionId: true,
} satisfies Prisma.LinkedInFuenteSelect;

export type LinkedInFuenteSafe = Prisma.LinkedInFuenteGetPayload<{
  select: typeof LINKEDIN_FUENTE_SAFE_SELECT;
}>;

type LinkedInFuenteContextRow = Prisma.LinkedInFuenteGetPayload<{
  select: typeof LINKEDIN_FUENTE_CONTEXT_SELECT;
}>;

export type LinkedInFuenteContext = LinkedInFuenteSafe & {
  conexionId: string;
  bridgeId: string;
};

export type LinkedInFuenteInternal = Prisma.LinkedInFuenteGetPayload<{
  select: typeof LINKEDIN_FUENTE_INTERNAL_SELECT;
}>;

export interface UpsertDiscoveredSourceData {
  conexionId: string;
  cuentaPublicitariaId?: string | null;
  tipo: TipoFuenteLinkedIn;
  ownerUrn: string;
  nombre: string;
  tipoLead: TipoLeadLinkedIn;
}

export interface MarkSubscriptionData {
  estadoSuscripcion: EstadoSuscripcionLinkedIn;
  subscriptionId: string | null;
}

const DEFAULT_RECONCILIATION_LIMIT = 50;
const MAX_RECONCILIATION_LIMIT = 100;

function toContext(row: LinkedInFuenteContextRow): LinkedInFuenteContext {
  const { conexion, ...fuente } = row;
  return { ...fuente, bridgeId: conexion.bridgeId };
}

function boundedReconciliationLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_RECONCILIATION_LIMIT;
  return Math.min(MAX_RECONCILIATION_LIMIT, Math.max(1, Math.trunc(limit)));
}

/**
 * Redescubrir una fuente solo actualiza metadatos provistos por LinkedIn. La
 * activación, suscripción y posición de reconciliación siguen bajo control
 * local y nunca se reinician por un nuevo barrido de discovery.
 */
export async function upsertDiscoveredSource(
  data: UpsertDiscoveredSourceData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteSafe> {
  const metadata = {
    cuentaPublicitariaId: data.cuentaPublicitariaId ?? null,
    tipo: data.tipo,
    nombre: data.nombre,
  };

  return client.linkedInFuente.upsert({
    where: {
      conexionId_ownerUrn_tipoLead: {
        conexionId: data.conexionId,
        ownerUrn: data.ownerUrn,
        tipoLead: data.tipoLead,
      },
    },
    create: {
      conexionId: data.conexionId,
      ownerUrn: data.ownerUrn,
      tipoLead: data.tipoLead,
      ...metadata,
    },
    update: metadata,
    select: LINKEDIN_FUENTE_SAFE_SELECT,
  });
}

/** Proyección administrativa segura; la relación con la conexión no incluye tokens. */
export async function listByBridge(
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteSafe[]> {
  return client.linkedInFuente.findMany({
    where: { conexion: { bridgeId } },
    select: LINKEDIN_FUENTE_SAFE_SELECT,
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
  });
}

/** Valida fuente → conexión → bridge dentro de la misma consulta. */
export async function findByIdForBridge(
  id: string,
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteSafe | null> {
  return client.linkedInFuente.findFirst({
    where: { id, conexion: { bridgeId } },
    select: LINKEDIN_FUENTE_SAFE_SELECT,
  });
}

/**
 * Resolver por owner nunca elige una coincidencia arbitraria. Sin unicidad
 * global en esquema, dos fuentes activas son un conflicto explícito y seguro.
 */
export async function findActiveByOwner(
  ownerUrn: string,
  tipoLead: TipoLeadLinkedIn,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteContext | null> {
  const coincidencias = await client.linkedInFuente.findMany({
    where: { ownerUrn, tipoLead, activa: true },
    select: LINKEDIN_FUENTE_CONTEXT_SELECT,
    orderBy: { id: "asc" },
    take: 2,
  });
  if (coincidencias.length > 1) {
    throw new AppError(
      "linkedin_fuente_ambigua",
      409,
      "Hay más de una fuente LinkedIn activa para el owner y tipo de lead",
    );
  }
  return coincidencias[0] ? toContext(coincidencias[0]) : null;
}

/**
 * Igual que `findByIdForBridge`, pero expone `subscriptionId` para el
 * servicio de suscripción. No usar fuera de ese servicio.
 */
export async function findInternalByIdForBridge(
  id: string,
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteInternal | null> {
  return client.linkedInFuente.findFirst({
    where: { id, conexion: { bridgeId } },
    select: LINKEDIN_FUENTE_INTERNAL_SELECT,
  });
}

export async function setActive(
  id: string,
  activa: boolean,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteSafe> {
  return client.linkedInFuente.update({
    where: { id },
    data: { activa },
    select: LINKEDIN_FUENTE_SAFE_SELECT,
  });
}

export async function markSubscription(
  id: string,
  data: MarkSubscriptionData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteSafe> {
  return client.linkedInFuente.update({
    where: { id },
    data,
    select: LINKEDIN_FUENTE_SAFE_SELECT,
  });
}

/**
 * Candidatas activas para reconciliación. Incluye bridgeId para que el caller
 * resuelva credenciales mediante el servicio de tokens, nunca desde este DTO.
 */
export async function listActiveForReconciliation(
  limit = DEFAULT_RECONCILIATION_LIMIT,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInFuenteContext[]> {
  const fuentes = await client.linkedInFuente.findMany({
    where: { activa: true, conexion: { estado: "ACTIVA" } },
    select: LINKEDIN_FUENTE_CONTEXT_SELECT,
    orderBy: [
      { ultimaSincronizacionEn: { sort: "asc", nulls: "first" } },
      { id: "asc" },
    ],
    take: boundedReconciliationLimit(limit),
  });
  return fuentes.map(toContext);
}

/** Compare-and-set monotónico: una reconciliación atrasada nunca pisa un cursor más nuevo. */
export async function advanceReconciliationCursor(
  id: string,
  cursor: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<boolean> {
  const result = await client.linkedInFuente.updateMany({
    where: {
      id,
      OR: [
        { ultimaSincronizacionEn: null },
        { ultimaSincronizacionEn: { lt: cursor } },
      ],
    },
    data: { ultimaSincronizacionEn: cursor },
  });
  return result.count === 1;
}
