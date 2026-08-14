import type { LeadEvento, Prisma } from "@prisma/client";
import { prisma, type PrismaClientOrTransaction } from "../lib/prisma.js";

export interface CreateEventoData {
  leadId: string;
  tipo: LeadEvento["tipo"];
  etapaAnterior?: LeadEvento["etapaAnterior"];
  etapaNueva?: LeadEvento["etapaNueva"];
  /**
   * M5 (D17, diseño M5): un cambio de color se registra en un evento
   * `CAMBIO_SEMAFORO` propio, independiente de `CAMBIO_ETAPA`, dentro de la
   * misma transacción cuando ambos cambian juntos. Opcionales — el resto de
   * los tipos de evento (M3/M4) los dejan `undefined`/NULL, sin cambio de
   * comportamiento.
   */
  semaforoAnterior?: LeadEvento["semaforoAnterior"];
  semaforoNuevo?: LeadEvento["semaforoNuevo"];
  detalle?: Prisma.InputJsonValue;
}

/**
 * §3 (docs/03-modelo-datos.md): `lead_eventos` es una bitácora inmutable.
 * Esta función solo inserta — nunca hay `update`/`delete` sobre este modelo
 * en ningún módulo (D-responsableId, diseño M3).
 */
export async function createEvento(
  data: CreateEventoData,
  client: PrismaClientOrTransaction = prisma,
): Promise<LeadEvento> {
  return client.leadEvento.create({ data });
}
