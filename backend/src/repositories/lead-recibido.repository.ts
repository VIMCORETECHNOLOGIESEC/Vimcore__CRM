import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";
import type { LeadEntrante } from "../types/lead-entrante.js";

export const INGESTA_LEASE_MS = 60_000;
export const INGESTA_MAX_INTENTOS = 3;
export const INGESTA_RETRY_MS = [60_000, 300_000] as const;

export interface PersistedLeadEntranteV1 {
  version: 1;
  recibidoEn: string;
  entrada: Omit<LeadEntrante, "ingresadoEn"> & { ingresadoEn: string };
}

export interface AceptacionLead {
  recepcionId: string;
  estado: "ACEPTADO";
}

export interface InboxClaim {
  recepcionId: string;
  leaseOwner: string;
  intento: number;
  leaseHasta: Date;
  entradaProcesamiento: PersistedLeadEntranteV1;
}

interface InboxClaimRow {
  recepcionId: string;
  leaseOwner: string;
  intento: number;
  leaseHasta: Date;
  entradaProcesamiento: Prisma.JsonValue;
}

function persistirEntrada(entrada: LeadEntrante, recibidoEn: Date): PersistedLeadEntranteV1 {
  return {
    version: 1,
    recibidoEn: recibidoEn.toISOString(),
    entrada: { ...entrada, ingresadoEn: entrada.ingresadoEn.toISOString() },
  };
}

export async function aceptarLeadRecibido(
  entrada: LeadEntrante,
  recibidoEn: Date = new Date(),
  client: PrismaClientOrTransaction = prisma,
): Promise<AceptacionLead> {
  const envelope = persistirEntrada(entrada, recibidoEn);
  const [row] = await client.$queryRaw<Array<{ recepcionId: string }>>(Prisma.sql`
    INSERT INTO leads_recibidos (
      id, bridge_id, id_externo_lead, payload, datos_incompletos, recibido_en,
      entrada_procesamiento, estado, disponible_en
    ) VALUES (
      ${randomUUID()}::uuid, ${entrada.bridgeId}::uuid, ${entrada.idExternoLead},
      ${JSON.stringify(entrada.payloadOriginal)}::jsonb,
      ${entrada.telefono === null && entrada.correo === null}, ${recibidoEn},
      ${JSON.stringify(envelope)}::jsonb, 'PENDIENTE', ${recibidoEn}
    )
    ON CONFLICT (bridge_id, id_externo_lead)
    DO UPDATE SET bridge_id = EXCLUDED.bridge_id
    RETURNING id AS "recepcionId"
  `);
  return { recepcionId: row.recepcionId, estado: "ACEPTADO" };
}

export async function claimNext(
  now: Date,
  owner: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<InboxClaim | null> {
  const [row] = await client.$queryRaw<InboxClaimRow[]>(Prisma.sql`
    WITH candidate AS (
      SELECT id
      FROM leads_recibidos
      WHERE
        (estado IN ('PENDIENTE', 'REINTENTO') AND disponible_en <= ${now})
        OR (estado = 'PROCESANDO' AND lease_hasta <= ${now})
      ORDER BY disponible_en, recibido_en
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE leads_recibidos AS reception
    SET estado = 'PROCESANDO', intentos = intentos + 1,
        lease_owner = ${owner}, lease_hasta = ${now} + (${INGESTA_LEASE_MS} * interval '1 millisecond')
    FROM candidate
    WHERE reception.id = candidate.id
    RETURNING reception.id AS "recepcionId", reception.lease_owner AS "leaseOwner",
      reception.intentos AS intento, reception.lease_hasta AS "leaseHasta",
      reception.entrada_procesamiento AS "entradaProcesamiento"
  `);
  return row ? { ...row, entradaProcesamiento: row.entradaProcesamiento as unknown as PersistedLeadEntranteV1 } : null;
}

export async function lockValidClaim(
  recepcionId: string,
  owner: string,
  client: PrismaClientOrTransaction,
): Promise<InboxClaim | null> {
  const [row] = await client.$queryRaw<InboxClaimRow[]>(Prisma.sql`
    SELECT id AS "recepcionId", lease_owner AS "leaseOwner", intentos AS intento,
      lease_hasta AS "leaseHasta", entrada_procesamiento AS "entradaProcesamiento"
    FROM leads_recibidos
    WHERE id = ${recepcionId}::uuid AND estado = 'PROCESANDO'
      AND lease_owner = ${owner} AND lease_hasta > clock_timestamp()
    FOR UPDATE
  `);
  return row ? { ...row, entradaProcesamiento: row.entradaProcesamiento as unknown as PersistedLeadEntranteV1 } : null;
}

export async function completeClaim(
  recepcionId: string,
  owner: string,
  leadId: string,
  client: PrismaClientOrTransaction,
): Promise<boolean> {
  const rows = await client.$executeRaw(Prisma.sql`
    UPDATE leads_recibidos SET lead_id = ${leadId}::uuid, estado = 'PROCESADO',
      procesado_en = clock_timestamp(), lease_owner = NULL, lease_hasta = NULL, ultimo_error = NULL
    WHERE id = ${recepcionId}::uuid AND estado = 'PROCESANDO'
      AND lease_owner = ${owner} AND lease_hasta > clock_timestamp()
  `);
  return rows === 1;
}

export async function marcarFallo(
  recepcionId: string,
  owner: string,
  error: unknown,
  now: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<boolean> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  const rows = await client.$executeRaw(Prisma.sql`
    UPDATE leads_recibidos
    SET estado = CASE WHEN intentos >= ${INGESTA_MAX_INTENTOS}
          THEN 'FALLA_MANUAL'::estado_recepcion ELSE 'REINTENTO'::estado_recepcion END,
      disponible_en = CASE WHEN intentos = 1
          THEN ${now} + (${INGESTA_RETRY_MS[0]} * interval '1 millisecond')
          ELSE ${now} + (${INGESTA_RETRY_MS[1]} * interval '1 millisecond') END,
      ultimo_error = ${message}, lease_owner = NULL, lease_hasta = NULL
    WHERE id = ${recepcionId}::uuid AND estado = 'PROCESANDO'
      AND lease_owner = ${owner} AND lease_hasta > clock_timestamp()
  `);
  return rows === 1;
}

/**
 * Alias snake_case -> camelCase (mismo patrón que
 * `cliente.repository.ts::CLIENTE_RETURNING`, D3 diseño M3): `$queryRaw`
 * devuelve filas ya con la forma camelCase esperada por el resto del código.
 */
const LEAD_RECIBIDO_RETURNING = Prisma.sql`
  id,
  bridge_id         AS "bridgeId",
  id_externo_lead   AS "idExternoLead",
  lead_id           AS "leadId",
  payload,
  datos_incompletos AS "datosIncompletos",
  recibido_en       AS "recibidoEn"
`;

export interface UpsertLeadRecibidoData {
  bridgeId: string;
  idExternoLead: string;
  payload: unknown;
  datosIncompletos: boolean;
}

export interface LeadRecibidoRow {
  id: string;
  bridgeId: string;
  idExternoLead: string;
  leadId: string | null;
  payload: Prisma.JsonValue;
  datosIncompletos: boolean;
  recibidoEn: Date;
  /** `xmax = 0`: `true` en la primera inserción, `false` en un reintento en conflicto. */
  recepcionCreada: boolean;
}

/**
 * Idempotencia de recepción (docs/05-bridges.md §2, Requirement: Idempotent
 * reception): `ON CONFLICT (bridge_id, id_externo_lead) DO UPDATE` — nunca
 * `upsert`/catch-P2002 — para garantizar exactamente una fila incluso ante
 * redelivery concurrente del mismo webhook. `xmax = 0` es el mismo idioma de
 * Postgres que `cliente.repository.ts::upsertByTelefonoNormalizado` (D3,
 * diseño M3) para distinguir inserción de conflicto dentro de la misma
 * sentencia. Debe ser la PRIMERA sentencia de la transacción de ingesta
 * (DD2(b)/DD5, diseño M4): un reintento tras rollback no deja fila
 * committeada, así que vuelve a insertar (`xmax = 0` verdadero) en vez de
 * quedar como estado obsoleto.
 */
export async function upsertLeadRecibido(
  data: UpsertLeadRecibidoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LeadRecibidoRow> {
  const [row] = await client.$queryRaw<LeadRecibidoRow[]>(Prisma.sql`
    INSERT INTO leads_recibidos (
      id, bridge_id, id_externo_lead, payload, datos_incompletos, recibido_en,
      entrada_procesamiento, estado
    )
    VALUES (
      ${randomUUID()}::uuid,
      ${data.bridgeId}::uuid,
      ${data.idExternoLead},
      ${JSON.stringify(data.payload)}::jsonb,
      ${data.datosIncompletos},
      now(),
      jsonb_build_object('version', 0, 'payloadLegacy', ${JSON.stringify(data.payload)}::jsonb),
      'PENDIENTE'
    )
    ON CONFLICT (bridge_id, id_externo_lead)
    DO UPDATE SET bridge_id = EXCLUDED.bridge_id
    RETURNING ${LEAD_RECIBIDO_RETURNING}, (xmax = 0) AS "recepcionCreada"
  `);

  return row; // DO UPDATE garantiza exactamente una fila, siempre
}

/**
 * Ancla la recepción cruda al lead resultante de `deduplicateLead`, una vez
 * resuelto dentro de la misma transacción (DD5, diseño M4). Sin máquina de
 * estados de recepción (D2 retirada): `leadId` pasa de `null` a un id, punto.
 */
export async function marcarProcesado(
  recepcionId: string,
  leadId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.leadRecibido.update({
    where: { id: recepcionId },
    data: { leadId, estado: "PROCESADO", procesadoEn: new Date() },
  });
}
