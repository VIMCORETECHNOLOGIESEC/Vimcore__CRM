import { Prisma, type BridgeLog, type NivelBridgeLog } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface RegistrarLogData {
  bridgeId: string | null;
  nivel: NivelBridgeLog;
  mensaje: string;
  payload?: unknown;
}

/**
 * DD5 (diseño M4): único repositorio del proyecto que NO acepta
 * `PrismaClientOrTransaction`. Siempre escribe contra el cliente global
 * `prisma`, nunca dentro de una transacción de ingesta — así "fuera de la
 * transacción" (Requirement: Bridge log durability) es un error de tipos en
 * cualquier llamada futura que intente pasar un `tx`, no una convención que
 * una edición descuidada pueda romper en silencio.
 *
 * Cada sitio de llamada envuelve `registrarLog` en su propio `try/catch`
 * degradando a `logger.error` (diseño M4, DD5): un fallo al loguear nunca
 * debe enmascarar el error original que se intentaba registrar.
 */
export async function registrarLog(
  data: RegistrarLogData,
  client: PrismaClientOrTransaction = prisma,
) {
  return client.bridgeLog.create({
    data: {
      bridgeId: data.bridgeId,
      nivel: data.nivel,
      mensaje: data.mensaje,
      payload:
        data.payload === undefined
          ? Prisma.JsonNull
          : (JSON.parse(JSON.stringify(data.payload)) as Prisma.InputJsonValue),
    },
  });
}

export interface ListByBridgeFiltros {
  bridgeId: string;
  nivel?: NivelBridgeLog;
  fechaDesde?: Date;
  fechaHasta?: Date;
}

/**
 * `GET /bridges/:id/logs` (diseño m4-bridges-crud-fundacion, DD "log reads
 * are capped server-side"): el clamp `limite<=500` con default 100 vive en
 * `bridge.service.ts` (PR3) — este repositorio recibe `limite` ya resuelto
 * por el caller y solo lo aplica como `take`, montado sobre el índice
 * existente `@@index([bridgeId, ocurridoEn(sort: Desc)])`.
 */
export async function listByBridge(
  filtros: ListByBridgeFiltros,
  limite: number,
  client: PrismaClientOrTransaction = prisma,
): Promise<BridgeLog[]> {
  return client.bridgeLog.findMany({
    where: {
      bridgeId: filtros.bridgeId,
      nivel: filtros.nivel,
      ocurridoEn: {
        gte: filtros.fechaDesde,
        lte: filtros.fechaHasta,
      },
    },
    orderBy: { ocurridoEn: "desc" },
    take: limite,
  });
}
