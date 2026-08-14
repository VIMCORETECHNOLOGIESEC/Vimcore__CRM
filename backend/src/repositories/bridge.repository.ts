import type { Bridge } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * D-M4 (diseño, tarea PR1.5): búsqueda del bridge por el hash de su clave de
 * API. La comparación en sí (`compareClaveBridge`) y su uso en el
 * middleware de autenticación son responsabilidad de PR3b.
 */
export async function findByClaveApiHash(
  claveApiHash: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Bridge | null> {
  return client.bridge.findUnique({ where: { claveApiHash } });
}

/**
 * Marca el momento del último lead recibido por un bridge
 * (`bridges.ultimo_lead_en`, docs/03-modelo-datos.md) — sostiene la futura
 * detección de bridges mudos (docs/05-bridges.md §8), fuera de alcance en
 * esta rebanada.
 */
export async function touchUltimoLeadEn(
  bridgeId: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<void> {
  await client.bridge.update({
    where: { id: bridgeId },
    data: { ultimoLeadEn: new Date() },
  });
}
