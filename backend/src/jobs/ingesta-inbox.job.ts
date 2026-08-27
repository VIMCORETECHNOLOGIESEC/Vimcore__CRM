import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";
import { runWithTenantContext } from "../lib/prisma.js";
import * as inbox from "../repositories/lead-recibido.repository.js";
import { procesarRecepcion } from "../services/ingesta.service.js";

export const INGESTA_POLL_MS = 1_000;

export async function runIngestionOnce(now: Date = new Date()): Promise<void> {
  const owner = randomUUID();
  const claim = await inbox.claimNext(now, owner);
  if (!claim) return;
  const startedAt = Date.now();
  try {
    // Bloque C (Etapa 3, D2/D3, batch 3 discovery): este worker
    // (`startIngestionWorker`) corre en un `setTimeout` propio, nunca dentro
    // de un ciclo de request HTTP — cada claim reclamado puede pertenecer a
    // CUALQUIER empresa (la cola de `leads_recibidos` es compartida entre
    // todas). `empresaId: null` (D3, "holding-wide" vía el ROL DE
    // APLICACIÓN, spec §2 "HTTP request always uses application role" —
    // aunque este camino no es HTTP, sigue conectando como `crm_app`, nunca
    // `crm_bypass_jobs`) es la forma correcta de darle visibilidad completa
    // sin usar el rol de bypass, reservado a los jobs administrativos
    // documentados (D1). Sin esto, `procesarRecepcion` (que internamente
    // toca `leads`/`lead_eventos`/`citas`/`notificaciones`, todas con RLS)
    // corría sin TenantContext y fallaba fail-closed en cada tick.
    await runWithTenantContext({ empresaId: null }, () => procesarRecepcion(claim));
    logger.info({ recepcionId: claim.recepcionId, intento: claim.intento, duracionMs: Date.now() - startedAt }, "ingesta: recepción completada");
  } catch (error) {
    const failedAt = new Date();
    const recorded = await inbox.marcarFallo(claim.recepcionId, owner, error, failedAt);
    logger[recorded ? "warn" : "error"](
      { recepcionId: claim.recepcionId, intento: claim.intento, err: error },
      recorded ? "ingesta: fallo registrado" : "ingesta: propietario obsoleto no pudo registrar fallo",
    );
  }
}

export interface IngestionWorker {
  stopAndDrain(): Promise<void>;
}

interface WorkerOptions {
  pollMs?: number;
  runOnce?: () => Promise<void>;
}

let singleton: IngestionWorker | undefined;

export function startIngestionWorker(options: WorkerOptions = {}): IngestionWorker {
  if (singleton) return singleton;
  const pollMs = options.pollMs ?? INGESTA_POLL_MS;
  const runOnce = options.runOnce ?? runIngestionOnce;
  let stopping = false;
  let active: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (stopping) return;
    timer = setTimeout(() => {
      active = runOnce()
        .catch((err: unknown) => logger.error({ err }, "ingesta: fallo inesperado del worker"))
        .finally(() => {
          active = undefined;
          schedule();
        });
    }, pollMs);
    timer.unref();
  };
  schedule();
  singleton = {
    async stopAndDrain() {
      stopping = true;
      if (timer) clearTimeout(timer);
      await active;
    },
  };
  return singleton;
}
