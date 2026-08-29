import { Prisma, type Conversacion } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

const responsableSelect = {
  id: true,
  nombre: true,
} as const satisfies Prisma.UsuarioSelect;

const clienteSelect = {
  id: true,
  nombre: true,
  telefonoOriginal: true,
  telefonoNormalizado: true,
} as const satisfies Prisma.ClienteSelect;

const CONVERSACION_RELACIONES_INCLUDE = {
  cliente: { select: clienteSelect },
  asesor: { select: responsableSelect },
} as const satisfies Prisma.ConversacionInclude;

export type ConversacionConRelaciones = Prisma.ConversacionGetPayload<{
  include: typeof CONVERSACION_RELACIONES_INCLUDE;
}>;

/** `@@unique([clienteId, conexionId])` del schema — un hilo por (cliente, conexión). */
export async function findByClienteYConexion(
  clienteId: string,
  conexionId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Conversacion | null> {
  return client.conversacion.findUnique({
    where: { clienteId_conexionId: { clienteId, conexionId } },
  });
}

export async function findById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<ConversacionConRelaciones | null> {
  return client.conversacion.findUnique({
    where: { id },
    include: CONVERSACION_RELACIONES_INCLUDE,
  });
}

/** Bloquea la fila antes de releer — mismo patrón que `lead.repository.ts::findByIdForUpdate`, usado por el job de SLA. */
export async function findByIdForUpdate(
  id: string,
  client: PrismaClientOrTransaction,
): Promise<Conversacion | null> {
  await client.$queryRaw(Prisma.sql`SELECT id FROM conversaciones_whatsapp WHERE id = ${id}::uuid FOR UPDATE`);
  return client.conversacion.findUnique({ where: { id } });
}

export interface CreateConversacionData {
  clienteId: string;
  conexionId: string;
  empresaId: string;
  asesorId: string | null;
  ultimoMensajeEn: Date;
  creadaEn: Date;
}

export async function create(
  data: CreateConversacionData,
  client: PrismaClientOrTransaction = prisma,
): Promise<Conversacion> {
  return client.conversacion.create({ data });
}

export async function updateAsesor(
  id: string,
  asesorId: string | null,
  client: PrismaClientOrTransaction = prisma,
): Promise<Conversacion> {
  return client.conversacion.update({ where: { id }, data: { asesorId } });
}

export async function touchUltimoMensajeEn(
  id: string,
  ultimoMensajeEn: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.conversacion.update({ where: { id }, data: { ultimoMensajeEn } });
}

export interface FindManyConversacionesOptions {
  skip: number;
  take: number;
}

export interface FindManyConversacionesResult {
  conversaciones: ConversacionConRelaciones[];
  total: number;
}

/**
 * El `where` completo (incluido el filtro de rol/empresa) lo arma el
 * servicio — mismo criterio que `lead.repository.ts::findMany` (DD5, M5).
 */
export async function findMany(
  where: Prisma.ConversacionWhereInput,
  options: FindManyConversacionesOptions,
  client: PrismaClientOrTransaction = prisma,
): Promise<FindManyConversacionesResult> {
  const [conversaciones, total] = await Promise.all([
    client.conversacion.findMany({
      where,
      skip: options.skip,
      take: options.take,
      orderBy: { ultimoMensajeEn: "desc" },
      include: CONVERSACION_RELACIONES_INCLUDE,
    }),
    client.conversacion.count({ where }),
  ]);
  return { conversaciones, total };
}

export interface CandidatoSlaVencido {
  id: string;
  empresaId: string;
  asesorId: string;
}

/**
 * Candidatos a reasignación por SLA (rule 3, batch whatsappMessages): la
 * `Conversacion` tiene un asesor asignado y su ÚLTIMO mensaje es ENTRANTE
 * (el asesor todavía no respondió) y ocurrió antes de `frontera`. Corre
 * holding-wide — ver `services/whatsappMessages/whatsapp-sla.service.ts`
 * para por qué (no hay una entrada de `BYPASS_JOB_ALLOWLIST` para este job,
 * `lib/prisma.ts` está fuera del alcance aditivo de este cambio).
 */
export async function findCandidatosSlaVencido(
  frontera: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<CandidatoSlaVencido[]> {
  return client.$queryRaw<CandidatoSlaVencido[]>(Prisma.sql`
    SELECT c.id, c.empresa_id AS "empresaId", c.asesor_id AS "asesorId"
    FROM conversaciones_whatsapp c
    JOIN LATERAL (
      SELECT direccion, enviado_en
      FROM mensajes_whatsapp
      WHERE conversacion_id = c.id
      ORDER BY enviado_en DESC
      LIMIT 1
    ) ultimo ON true
    WHERE c.asesor_id IS NOT NULL
      AND ultimo.direccion = 'ENTRANTE'
      AND ultimo.enviado_en <= ${frontera}::timestamptz
  `);
}
