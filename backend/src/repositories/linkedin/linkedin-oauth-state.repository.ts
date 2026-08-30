import { Prisma, type LinkedInOAuthState } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface CreateLinkedInOAuthStateData {
  stateHash: string;
  bridgeId: string;
  usuarioId: string;
  expiraEn: Date;
}

export async function createState(
  data: CreateLinkedInOAuthStateData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInOAuthState> {
  return client.linkedInOAuthState.create({ data });
}

const OAUTH_STATE_RETURNING = Prisma.sql`
  id,
  state_hash AS "stateHash",
  bridge_id  AS "bridgeId",
  usuario_id AS "usuarioId",
  expira_en  AS "expiraEn",
  usado_en   AS "usadoEn",
  creado_en  AS "creadoEn"
`;

async function consumeValidStateWithClient(
  stateHash: string,
  client: PrismaClientOrTransaction,
): Promise<LinkedInOAuthState | null> {
  const [state] = await client.$queryRaw<LinkedInOAuthState[]>(Prisma.sql`
    UPDATE linkedin_oauth_states
    SET usado_en = clock_timestamp()
    WHERE state_hash = ${stateHash}
      AND usado_en IS NULL
      AND expira_en > clock_timestamp()
    RETURNING ${OAUTH_STATE_RETURNING}
  `);
  return state ?? null;
}

/**
 * Consume el state con una única sentencia condicional. El lock de fila del
 * UPDATE hace que dos callbacks concurrentes no puedan ganar el mismo state.
 *
 * Sin cliente explícito se abre una transacción para que el SQL crudo reciba
 * las GUC de tenant; un cliente inyectado debe pertenecer a la transacción del
 * caller, igual que los demás repositorios que componen operaciones atómicas.
 */
export async function consumeValidState(
  stateHash: string,
  client?: PrismaClientOrTransaction,
): Promise<LinkedInOAuthState | null> {
  if (client) return consumeValidStateWithClient(stateHash, client);
  return prisma.$transaction((tx) => consumeValidStateWithClient(stateHash, tx));
}

/**
 * Prisma no ofrece un límite para deleteMany y el repositorio no tiene un
 * patrón de limpieza acotada equivalente; elimina las filas ya expiradas.
 */
export async function deleteExpiredStates(
  ahora: Date = new Date(),
  client: PrismaClientOrTransaction = prisma,
): Promise<number> {
  const resultado = await client.linkedInOAuthState.deleteMany({
    where: { expiraEn: { lte: ahora } },
  });
  return resultado.count;
}
