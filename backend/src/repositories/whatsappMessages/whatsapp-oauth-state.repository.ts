import { Prisma, type WhatsAppOAuthState } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

/** Mirror exacto de `linkedin-oauth-state.repository.ts`, adaptado a `WhatsAppOAuthState` (empresaId + usuarioId, sin bridgeId). */
export interface CreateWhatsAppOAuthStateData {
  stateHash: string;
  empresaId: string;
  usuarioId: string;
  expiraEn: Date;
}

export async function createState(
  data: CreateWhatsAppOAuthStateData,
  client: PrismaClientOrTransaction = prisma,
): Promise<WhatsAppOAuthState> {
  return client.whatsAppOAuthState.create({ data });
}

const OAUTH_STATE_RETURNING = Prisma.sql`
  id,
  state_hash AS "stateHash",
  empresa_id AS "empresaId",
  usuario_id AS "usuarioId",
  expira_en  AS "expiraEn",
  usado_en   AS "usadoEn",
  creado_en  AS "creadoEn"
`;

async function consumeValidStateWithClient(
  stateHash: string,
  client: PrismaClientOrTransaction,
): Promise<WhatsAppOAuthState | null> {
  const [state] = await client.$queryRaw<WhatsAppOAuthState[]>(Prisma.sql`
    UPDATE whatsapp_oauth_states
    SET usado_en = clock_timestamp()
    WHERE state_hash = ${stateHash}
      AND usado_en IS NULL
      AND expira_en > clock_timestamp()
    RETURNING ${OAUTH_STATE_RETURNING}
  `);
  return state ?? null;
}

/**
 * Consume el state con una única sentencia condicional — el lock de fila del
 * `UPDATE` hace que dos callbacks concurrentes no puedan ganar el mismo
 * state (mismo patrón que `linkedin-oauth-state.repository.ts`).
 */
export async function consumeValidState(
  stateHash: string,
  client?: PrismaClientOrTransaction,
): Promise<WhatsAppOAuthState | null> {
  if (client) return consumeValidStateWithClient(stateHash, client);
  return prisma.$transaction((tx) => consumeValidStateWithClient(stateHash, tx));
}

export async function deleteExpiredStates(
  ahora: Date = new Date(),
  client: PrismaClientOrTransaction = prisma,
): Promise<number> {
  const resultado = await client.whatsAppOAuthState.deleteMany({
    where: { expiraEn: { lte: ahora } },
  });
  return resultado.count;
}
