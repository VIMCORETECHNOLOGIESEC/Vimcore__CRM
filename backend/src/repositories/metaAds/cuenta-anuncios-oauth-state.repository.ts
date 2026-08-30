import { Prisma, type CuentaAnunciosOAuthState } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

export interface CreateCuentaAnunciosOAuthStateData {
  stateHash: string;
  empresaId: string;
  usuarioId: string;
  expiraEn: Date;
}

export async function createState(
  data: CreateCuentaAnunciosOAuthStateData,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaAnunciosOAuthState> {
  return client.cuentaAnunciosOAuthState.create({ data });
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
): Promise<CuentaAnunciosOAuthState | null> {
  const [state] = await client.$queryRaw<CuentaAnunciosOAuthState[]>(Prisma.sql`
    UPDATE cuentas_anuncios_oauth_states
    SET usado_en = clock_timestamp()
    WHERE state_hash = ${stateHash}
      AND usado_en IS NULL
      AND expira_en > clock_timestamp()
    RETURNING ${OAUTH_STATE_RETURNING}
  `);
  return state ?? null;
}

export async function consumeValidState(
  stateHash: string,
  client?: PrismaClientOrTransaction,
): Promise<CuentaAnunciosOAuthState | null> {
  if (client) return consumeValidStateWithClient(stateHash, client);
  return prisma.$transaction((tx) => consumeValidStateWithClient(stateHash, tx));
}

export async function deleteExpiredStates(
  ahora: Date = new Date(),
  client: PrismaClientOrTransaction = prisma,
): Promise<number> {
  const resultado = await client.cuentaAnunciosOAuthState.deleteMany({
    where: { expiraEn: { lte: ahora } },
  });
  return resultado.count;
}
