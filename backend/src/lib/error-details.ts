/**
 * crm-company-event-poison-loop (T1): normalizes an unknown thrown value into
 * explicit, structured log fields instead of the ad hoc `{ message: string }`
 * shape that used to hide the real cause. `err` always carries a real `Error`
 * so pino's `stdSerializers.err` (wired in `lib/logger.ts`) expands it into
 * `name`/`message`/`stack`; `code`/`meta` are duck-typed rather than imported
 * from `@prisma/client` so this helper works for any error shape, but in
 * practice they come from Prisma's `PrismaClientKnownRequestError` (`code`,
 * e.g. `P2002`) and friends (`PrismaClientValidationError` has no `code`).
 */
export interface ErrorDetails {
  err: Error;
  code?: string;
  meta?: unknown;
}

export function describeError(error: unknown): ErrorDetails {
  const err = error instanceof Error ? error : new Error(String(error));
  const details: ErrorDetails = { err };

  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; meta?: unknown };
    if (typeof candidate.code === "string") details.code = candidate.code;
    if (candidate.meta !== undefined) details.meta = candidate.meta;
  }

  return details;
}
