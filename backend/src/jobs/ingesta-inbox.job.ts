import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.js";
import * as inbox from "../repositories/lead-recibido.repository.js";
import { procesarRecepcion } from "../services/ingesta.service.js";

export const INGESTA_POLL_MS = 1_000;

export async function runIngestionOnce(now: Date = new Date()): Promise<void> {
  const owner = randomUUID();
  const claim = await inbox.claimNext(now, owner);
  if (!claim) return;
  const startedAt = Date.now();
  try {
    await procesarRecepcion(claim);
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
