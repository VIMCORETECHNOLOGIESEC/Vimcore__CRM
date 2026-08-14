import { Prisma, type NivelBridgeLog } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

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
export async function registrarLog(data: RegistrarLogData): Promise<void> {
  await prisma.bridgeLog.create({
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
