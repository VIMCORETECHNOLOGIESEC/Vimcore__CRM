import { describe, expect, it, vi } from "vitest";
import { startVerificacionTokenJob } from "../src/jobs/verificacion-token.job.js";
import { scheduledNotificationProducers } from "../src/jobs/notificaciones-programadas.js";
import { produceAlertaTokenPorExpirar } from "../src/services/verificacion-token.service.js";
import type { ResultadoVerificacionToken } from "../src/services/verificacion-token.service.js";

/** Mismo patrón que `bridge-mudo.job.test.ts` — guarda de re-entrada por flag en closure. */
describe("verificacion-token.job — startVerificacionTokenJob, guarda de re-entrada (mismo patron que bridge-mudo.job)", () => {
  it("descarta un tick mientras el anterior sigue en curso, y retoma en el siguiente disparo", async () => {
    vi.useFakeTimers();
    try {
      let resolverPrimeraCorrida: (() => void) | undefined;
      const verificarMock = vi.fn(
        () =>
          new Promise<ResultadoVerificacionToken>((resolve) => {
            resolverPrimeraCorrida = () => resolve({ candidatos: 0, invalidados: 0 });
          }),
      );

      startVerificacionTokenJob(1000, verificarMock);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(verificarMock).toHaveBeenCalledTimes(1);

      resolverPrimeraCorrida?.();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(verificarMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("notificaciones-programadas — scheduledNotificationProducers.tokenPorExpirar (M-hardening Bloque A, WU5)", () => {
  it("registra el productor preventivo produceAlertaTokenPorExpirar, distinto de verificacionToken", () => {
    expect(scheduledNotificationProducers.tokenPorExpirar).toBe(produceAlertaTokenPorExpirar);
    expect(scheduledNotificationProducers.tokenPorExpirar).not.toBe(
      scheduledNotificationProducers.verificacionToken,
    );
  });
});
