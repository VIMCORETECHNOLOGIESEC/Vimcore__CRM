import type { Campania } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

/**
 * M-hardening Bloque A (WU4, spec lead-attribution, D6): segundo paso del
 * lookup de dos pasos de `atribucion.service.ts::resolverAtribucion` — mismo
 * criterio que `@@unique([cuentaPublicitariaId, idExterno])`. La resolución
 * de campaña SIEMPRE depende de la cuenta resuelta primero (D6: a
 * diferencia de `CuentaPublicitaria`, que es única por `bridgeId`,
 * `Campania` es única por `cuentaPublicitariaId`, no por bridge). `null` es
 * un resultado válido (degradación silenciosa); el llamador nunca lanza por
 * un miss.
 */
export async function findByCuentaEIdExterno(
  cuentaPublicitariaId: string,
  idExterno: string,
  client: PrismaClientOrTransaction = prisma,
): Promise<Campania | null> {
  return client.campania.findUnique({
    where: { cuentaPublicitariaId_idExterno: { cuentaPublicitariaId, idExterno } },
  });
}
