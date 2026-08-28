import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";
import { VersionConflictError, withCasRetry } from "../src/services/asignacion.service.js";

/**
 * Bloque C (Etapa 3, Group 3, design D6): `withCasRetry` es una unidad pura
 * — sin BD real, `fn` mockeado devuelve/lanza directo. Complementa (no
 * reemplaza) los tests de integración de `asignacion.service.test.ts`, que
 * cubren el camino real contra Postgres.
 */
describe("asignacion.service — withCasRetry (design D6, spec 'Bounded retry — 3 attempts, no backoff')", () => {
  it("agota exactamente 3 intentos (ni más ni menos) cuando fn siempre rechaza con VersionConflictError", async () => {
    const fn = vi.fn(async () => {
      throw new VersionConflictError("lead-siempre-en-conflicto");
    });

    await expect(withCasRetry(fn)).rejects.toBeInstanceOf(AppError);

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("al agotar los intentos falla explícito con 409 asignacion_conflicto (spec §4, 'No silent loss on exhaustion') — nunca éxito ni no-op silencioso", async () => {
    const fn = vi.fn(async () => {
      throw new VersionConflictError("lead-siempre-en-conflicto-2");
    });

    await expect(withCasRetry(fn)).rejects.toMatchObject({
      code: "asignacion_conflicto",
      statusHttp: 409,
    });
  });

  it("ejecuta la corrección exactamente una vez después del tercer conflicto y antes de devolver 409", async () => {
    const fn = vi.fn(async () => {
      throw new VersionConflictError("lead-correccion");
    });
    const corregir = vi.fn(async () => undefined);

    await expect(withCasRetry(fn, corregir)).rejects.toMatchObject({
      code: "asignacion_conflicto",
      statusHttp: 409,
    });

    expect(fn).toHaveBeenCalledTimes(3);
    expect(corregir).toHaveBeenCalledOnce();
    expect(corregir).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-correccion" }));
  });

  it("retorna el resultado sin reintentar cuando fn resuelve en el primer intento", async () => {
    const fn = vi.fn(async () => "resultado-ok");

    const resultado = await withCasRetry(fn);

    expect(resultado).toBe("resultado-ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retorna el resultado del intento que finalmente gana el CAS, sin agotar los 3 intentos", async () => {
    let llamadas = 0;
    const fn = vi.fn(async () => {
      llamadas += 1;
      if (llamadas < 2) throw new VersionConflictError("lead-gana-segundo-intento");
      return "resultado-segundo-intento";
    });

    const resultado = await withCasRetry(fn);

    expect(resultado).toBe("resultado-segundo-intento");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("propaga inmediatamente (sin reintentar) cualquier error que NO sea VersionConflictError", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fallo de infraestructura, no de CAS");
    });

    await expect(withCasRetry(fn)).rejects.toThrow("fallo de infraestructura, no de CAS");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("no espera (sin backoff) entre reintentos — el presupuesto de tiempo total es mínimo", async () => {
    const fn = vi.fn(async () => {
      throw new VersionConflictError("lead-timing");
    });

    const inicio = Date.now();
    await expect(withCasRetry(fn)).rejects.toBeInstanceOf(AppError);
    const duracionMs = Date.now() - inicio;

    // Generoso a propósito (evita flakiness bajo carga de CI/Docker) — el
    // punto es descartar un backoff real de cientos de ms/segundos entre
    // intentos, no medir un presupuesto exacto.
    expect(duracionMs).toBeLessThan(200);
  });
});
