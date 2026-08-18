import type { CuentaPublicitaria } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * D-M4-fundacion (diseño m4-bridges-crud-fundacion, DD "CuentaPublicitaria
 * is one Facebook Page, not one ad account"): `idExterno` es la unidad de
 * suscripción de la plataforma (para Meta, el ID de la Página).
 * `idExternoVinculado` es el nombre de campo de Prisma tal cual —
 * `bridge.service.ts`/`cuenta-publicitaria.service.ts` (PR3) son la única
 * capa que lo mapea al nombre de contrato público `instagramAccountId`; este
 * repositorio nunca introduce un tercer nombre.
 */
export interface CreateCuentaPublicitariaData {
  bridgeId: string;
  idExterno: string;
  nombre: string;
  idExternoVinculado?: string | null;
}

export async function create(
  data: CreateCuentaPublicitariaData,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.create({ data });
}

/** `GET /bridges/:id` embebido y `GET /bridges/:id/cuentas` (PR3) comparten esta lectura. */
export async function listByBridge(
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria[]> {
  return client.cuentaPublicitaria.findMany({ where: { bridgeId }, orderBy: { nombre: "asc" } });
}

/** `PATCH /bridges/:id/cuentas/:cuentaId` (Requirement: … PATCH toggles only activation) — solo `activa`. */
export async function updateActiva(
  id: string,
  activa: boolean,
  client: PrismaClientOrTransaction = prisma,
): Promise<CuentaPublicitaria> {
  return client.cuentaPublicitaria.update({ where: { id }, data: { activa } });
}
