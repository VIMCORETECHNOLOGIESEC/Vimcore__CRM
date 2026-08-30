import { Prisma, type LinkedInConexion } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

const LINKEDIN_CONEXION_SAFE_SELECT = {
  id: true,
  bridgeId: true,
  autorizadoPorUsuarioId: true,
  memberUrn: true,
  accessTokenExpiraEn: true,
  refreshTokenExpiraEn: true,
  scopes: true,
  estado: true,
  revocadoEn: true,
  creadoEn: true,
  actualizadoEn: true,
} satisfies Prisma.LinkedInConexionSelect;

export type LinkedInConexionSafe = Prisma.LinkedInConexionGetPayload<{
  select: typeof LINKEDIN_CONEXION_SAFE_SELECT;
}>;

export type LinkedInConexionSummary = LinkedInConexionSafe & {
  tieneRefreshToken: boolean;
};

const LINKEDIN_CONEXION_SAFE_COLUMNS = Prisma.sql`
  id,
  bridge_id                       AS "bridgeId",
  autorizado_por_usuario_id      AS "autorizadoPorUsuarioId",
  member_urn                      AS "memberUrn",
  access_token_expira_en         AS "accessTokenExpiraEn",
  refresh_token_expira_en        AS "refreshTokenExpiraEn",
  scopes,
  estado,
  revocado_en                    AS "revocadoEn",
  creado_en                      AS "creadoEn",
  actualizado_en                 AS "actualizadoEn",
  (refresh_token_cifrado IS NOT NULL) AS "tieneRefreshToken"
`;

async function findSafeWithClient(
  bridgeId: string,
  client: PrismaClientOrTransaction,
): Promise<LinkedInConexionSummary | null> {
  const [conexion] = await client.$queryRaw<LinkedInConexionSummary[]>(Prisma.sql`
    SELECT ${LINKEDIN_CONEXION_SAFE_COLUMNS}
    FROM linkedin_conexiones
    WHERE bridge_id = ${bridgeId}::uuid
    LIMIT 1
  `);
  return conexion ?? null;
}

/**
 * Proyección segura para caminos administrativos: el SQL nunca devuelve el
 * ciphertext. Solo expone si existe refresh token para construir el DTO.
 */
export async function findByBridgeId(
  bridgeId: string,
  client?: PrismaClientOrTransaction,
): Promise<LinkedInConexionSummary | null> {
  if (client) return findSafeWithClient(bridgeId, client);
  return prisma.$transaction((tx) => findSafeWithClient(bridgeId, tx));
}

/** Uso interno exclusivo de servicios que deben llamar a LinkedIn. */
export async function findWithEncryptedTokens(
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInConexion | null> {
  return client.linkedInConexion.findUnique({ where: { bridgeId } });
}

export interface UpsertFromAuthorizationData {
  bridgeId: string;
  autorizadoPorUsuarioId: string;
  memberUrn?: string | null;
  accessTokenCifrado: string;
  refreshTokenCifrado?: string | null;
  accessTokenExpiraEn: Date;
  refreshTokenExpiraEn?: Date | null;
  scopes: string[];
}

export async function upsertFromAuthorization(
  data: UpsertFromAuthorizationData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInConexionSafe> {
  const refreshTokenCifrado = data.refreshTokenCifrado ?? null;
  const refreshTokenExpiraEn =
    refreshTokenCifrado === null ? null : (data.refreshTokenExpiraEn ?? null);
  const tokenData = {
    autorizadoPorUsuarioId: data.autorizadoPorUsuarioId,
    memberUrn: data.memberUrn ?? null,
    accessTokenCifrado: data.accessTokenCifrado,
    refreshTokenCifrado,
    accessTokenExpiraEn: data.accessTokenExpiraEn,
    refreshTokenExpiraEn,
    scopes: data.scopes,
    estado: "ACTIVA" as const,
    revocadoEn: null,
  };

  return client.linkedInConexion.upsert({
    where: { bridgeId: data.bridgeId },
    create: { bridgeId: data.bridgeId, ...tokenData },
    update: tokenData,
    select: LINKEDIN_CONEXION_SAFE_SELECT,
  });
}

interface RotateAccessTokenData {
  accessTokenCifrado: string;
  accessTokenExpiraEn: Date;
}

export type RotateTokensData = RotateAccessTokenData &
  (
    | {
        refreshTokenCifrado: string;
        refreshTokenExpiraEn: Date | null;
      }
    | {
        refreshTokenCifrado?: never;
        refreshTokenExpiraEn?: never;
      }
  );

/**
 * Un refresh siempre rota access token. Los campos refresh se omiten por
 * completo del UPDATE cuando LinkedIn no devuelve uno nuevo, para no borrar
 * una credencial todavía válida.
 */
export async function rotateTokens(
  id: string,
  data: RotateTokensData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInConexionSafe> {
  const updateData: Prisma.LinkedInConexionUpdateInput = {
    accessTokenCifrado: data.accessTokenCifrado,
    accessTokenExpiraEn: data.accessTokenExpiraEn,
  };
  if (data.refreshTokenCifrado !== undefined) {
    updateData.refreshTokenCifrado = data.refreshTokenCifrado;
    updateData.refreshTokenExpiraEn = data.refreshTokenExpiraEn;
  }

  return client.linkedInConexion.update({
    where: { id },
    data: updateData,
    select: LINKEDIN_CONEXION_SAFE_SELECT,
  });
}

export async function markTokenExpired(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInConexionSafe> {
  return client.linkedInConexion.update({
    where: { id },
    data: { estado: "TOKEN_EXPIRADO" },
    select: LINKEDIN_CONEXION_SAFE_SELECT,
  });
}

async function revokeWithClient(
  id: string,
  revocadoEn: Date,
  client: PrismaClientOrTransaction,
): Promise<LinkedInConexionSafe> {
  const conexion = await client.linkedInConexion.update({
    where: { id },
    data: { estado: "REVOCADA", revocadoEn },
    select: LINKEDIN_CONEXION_SAFE_SELECT,
  });
  await client.linkedInFuente.updateMany({
    where: { conexionId: id },
    data: { activa: false, estadoSuscripcion: "REVOCADA" },
  });
  return conexion;
}

/** Revoca la conexión y todas sus fuentes en la misma transacción local. */
export async function revoke(
  id: string,
  client?: PrismaClientOrTransaction,
): Promise<LinkedInConexionSafe> {
  const revocadoEn = new Date();
  if (client) return revokeWithClient(id, revocadoEn, client);
  return prisma.$transaction((tx) => revokeWithClient(id, revocadoEn, tx));
}

/**
 * Camino interno del job de refresh. Incluye ciphertext deliberadamente y
 * solo selecciona conexiones ACTIVA cuyo access token vence hasta el límite.
 */
export async function listDueForRefresh(
  limiteExpiracion: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<LinkedInConexion[]> {
  return client.linkedInConexion.findMany({
    where: {
      estado: "ACTIVA",
      accessTokenExpiraEn: { lte: limiteExpiracion },
    },
    orderBy: { accessTokenExpiraEn: "asc" },
  });
}
