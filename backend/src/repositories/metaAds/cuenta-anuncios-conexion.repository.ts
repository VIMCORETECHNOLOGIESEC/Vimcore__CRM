import { Prisma, type CuentaAnunciosConexion } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../../lib/prisma.js";

const CUENTA_ANUNCIOS_CONEXION_SAFE_SELECT = {
  id: true,
  empresaId: true,
  cuentaAnunciosIdExterno: true,
  nombre: true,
  moneda: true,
  zonaHoraria: true,
  estado: true,
  tokenExpiraEn: true,
  ultimaSincronizacionEn: true,
  ultimoError: true,
  creadoEn: true,
  actualizadoEn: true,
} satisfies Prisma.CuentaAnunciosConexionSelect;

export type CuentaAnunciosConexionSafe = Prisma.CuentaAnunciosConexionGetPayload<{
  select: typeof CUENTA_ANUNCIOS_CONEXION_SAFE_SELECT;
}>;

export async function findByEmpresaId(
  empresaId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaAnunciosConexionSafe | null> {
  return client.cuentaAnunciosConexion.findUnique({
    where: { empresaId },
    select: CUENTA_ANUNCIOS_CONEXION_SAFE_SELECT,
  });
}

export async function findWithTokenById(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaAnunciosConexion | null> {
  return client.cuentaAnunciosConexion.findUnique({ where: { id } });
}

export interface UpsertCuentaAnunciosConexionData {
  empresaId: string;
  autorizadoPorUsuarioId: string;
  cuentaAnunciosIdExterno: string;
  nombre: string;
  moneda: string | null;
  zonaHoraria: string | null;
  tokenCifrado: string;
  tokenExpiraEn: Date | null;
}

export async function upsertConexion(
  data: UpsertCuentaAnunciosConexionData,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaAnunciosConexionSafe> {
  const tokenData = {
    autorizadoPorUsuarioId: data.autorizadoPorUsuarioId,
    cuentaAnunciosIdExterno: data.cuentaAnunciosIdExterno,
    nombre: data.nombre,
    moneda: data.moneda,
    zonaHoraria: data.zonaHoraria,
    tokenCifrado: data.tokenCifrado,
    tokenExpiraEn: data.tokenExpiraEn,
    estado: "ACTIVA" as const,
    ultimoError: null,
  };
  return client.cuentaAnunciosConexion.upsert({
    where: { empresaId: data.empresaId },
    create: { empresaId: data.empresaId, ...tokenData },
    update: tokenData,
    select: CUENTA_ANUNCIOS_CONEXION_SAFE_SELECT,
  });
}

export interface CuentaAnunciosConexionElegible {
  id: string;
  empresaId: string;
}

export async function listEligibleForSync(
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaAnunciosConexionElegible[]> {
  return client.cuentaAnunciosConexion.findMany({
    where: { estado: "ACTIVA", tokenCifrado: { not: null } },
    select: { id: true, empresaId: true },
    orderBy: { actualizadoEn: "asc" },
  });
}

export async function markTokenExpired(
  id: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.cuentaAnunciosConexion.update({
    where: { id },
    data: { estado: "TOKEN_EXPIRADO", ultimoError: "Meta rechazó el token de la cuenta de anuncios" },
  });
}

export async function markSyncSuccess(
  id: string,
  sincronizadoEn: Date,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.cuentaAnunciosConexion.update({
    where: { id },
    data: { estado: "ACTIVA", ultimaSincronizacionEn: sincronizadoEn, ultimoError: null },
  });
}

export async function markSyncError(
  id: string,
  mensaje: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.cuentaAnunciosConexion.update({
    where: { id },
    data: { estado: "ERROR", ultimoError: mensaje.slice(0, 1_000) },
  });
}

export async function markTransientSyncError(
  id: string,
  mensaje: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.cuentaAnunciosConexion.update({
    where: { id },
    data: { ultimoError: mensaje.slice(0, 1_000) },
  });
}
