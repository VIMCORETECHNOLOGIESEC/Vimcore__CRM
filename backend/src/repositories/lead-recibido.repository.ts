import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

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
    INSERT INTO leads_recibidos (id, bridge_id, id_externo_lead, payload, datos_incompletos, recibido_en)
    VALUES (
      ${randomUUID()}::uuid,
      ${data.bridgeId}::uuid,
      ${data.idExternoLead},
      ${JSON.stringify(data.payload)}::jsonb,
      ${data.datosIncompletos},
      now()
    )
    ON CONFLICT (bridge_id, id_externo_lead)
    DO UPDATE SET bridge_id = EXCLUDED.bridge_id
    RETURNING ${LEAD_RECIBIDO_RETURNING}, (xmax = 0) AS "recepcionCreada"
  `);

  return row; // DO UPDATE garantiza exactamente una fila, siempre
}

/**
 * Ancla la recepción cruda al lead resultante de `deduplicarLead`, una vez
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
    data: { leadId },
  });
}
