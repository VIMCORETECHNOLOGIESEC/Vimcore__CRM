import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Alias compartido para repositorios que aceptan tanto el cliente global
 * como un `Prisma.TransactionClient` (D-M3): permite que funciones de
 * distintos repositorios corran dentro de la misma transacción sin duplicar
 * este tipo en cada archivo.
 */
export type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

/** Límites de espera/duración de una transacción interactiva de Prisma. */
export interface TransactionBounds {
  maxWait: number;
  timeout: number;
}

/**
 * Límites de la transacción de `deduplicateLead` cuando abre la suya propia
 * (M3, sin cambios de comportamiento).
 */
export const DEDUPLICACION_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `ingesta.service` (M4): envuelve a
 * `deduplicateLead` más los pasos de recepción/log, así que su `timeout` debe
 * ser mayor o igual al de dedup. Se deriva del bound de dedup, nunca se
 * duplica, para que "igual-o-más-amplio" sea estructural (DD3, diseño M4).
 */
export const INGESTA_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: DEDUPLICACION_TRANSACTION_BOUNDS.maxWait,
  timeout: DEDUPLICACION_TRANSACTION_BOUNDS.timeout + 10_000,
};

/**
 * Límites de la transacción de `leads.service`/`formularios.service` (M5,
 * DD4): validar acceso → validar formulario → calcular → escribir
 * `respuestas_formulario` → actualizar `Lead` → escribir `lead_eventos`, todo
 * en una sola transacción interactiva. NO se deriva de
 * `DEDUPLICACION_TRANSACTION_BOUNDS`/`INGESTA_TRANSACTION_BOUNDS` (a
 * diferencia de `INGESTA_TRANSACTION_BOUNDS`) porque las transacciones de M5
 * nunca anidan con las de M3/M4 — son un flujo de escritura independiente.
 */
export const GESTION_LEAD_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `asignacion.service` (M6, D11): independiente
 * — no se deriva de dedup/ingesta/gestión de leads, igual que
 * `GESTION_LEAD_TRANSACTION_BOUNDS` y por la misma razón (flujo de escritura
 * propio: `asignar`/`reasignar`/`traspasar` abren su propia transacción). La
 * asignación automática (D1) NUNCA usa este bound — recibe el `tx` vivo de
 * `INGESTA_TRANSACTION_BOUNDS` por parámetro.
 */
export const ASIGNACION_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `citas.service` (M7): independiente, mismo
 * criterio que `ASIGNACION_TRANSACTION_BOUNDS` — agendar/reprogramar una cita
 * es un flujo de escritura propio que nunca anida con dedup/ingesta/gestión
 * de leads/asignación.
 */
export const CITAS_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Seam D1 (diseño M4, DD1c): si el llamador ya trae una transacción externa
 * (`txExterna`), `fn` corre dentro de ella y `bounds` se ignora — nunca se
 * abre una segunda transacción/conexión (precondición de DD2). Si no,
 * `runInTransaction` abre su propia `prisma.$transaction` con `bounds`,
 * igual que antes de este seam (comportamiento por defecto preservado).
 */
export async function runInTransaction<T>(
  txExterna: Prisma.TransactionClient | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  bounds: TransactionBounds,
): Promise<T> {
  if (txExterna !== undefined) {
    return fn(txExterna);
  }
  return prisma.$transaction(fn, bounds);
}
