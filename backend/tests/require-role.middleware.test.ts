import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/services/shadow-authorization.service.js", () => ({
  compareRequireRole: vi.fn(async () => undefined),
}));

const shadowAuthorizationService = await import(
  "../src/services/shadow-authorization.service.js"
);
const { requireRole } = await import("../src/middlewares/require-role.middleware.js");

beforeEach(() => {
  vi.clearAllMocks();
});

function reqConUsuario(rol?: "ADMINISTRADOR" | "VENDEDOR"): Request {
  return {
    user: rol
      ? { id: "u1", nombre: "Test", correo: "t@t.com", rol }
      : undefined,
  } as unknown as Request;
}

describe("middlewares/require-role", () => {
  it("403 cuando el rol del usuario autenticado no está en la lista permitida", () => {
    const req = reqConUsuario("VENDEDOR");
    const next = vi.fn();

    requireRole("ADMINISTRADOR")(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0];
    expect(err).toMatchObject({ code: "permiso_denegado", statusHttp: 403 });
  });

  it("continúa sin error cuando el rol está permitido", () => {
    const req = reqConUsuario("ADMINISTRADOR");
    const next = vi.fn();

    requireRole("ADMINISTRADOR", "VENDEDOR")(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("403 cuando no hay usuario autenticado en absoluto", () => {
    const req = reqConUsuario(undefined);
    const next = vi.fn();

    requireRole("ADMINISTRADOR")(req, {} as Response, next);

    const err = next.mock.calls[0]![0];
    expect(err).toMatchObject({ code: "permiso_denegado", statusHttp: 403 });
  });
});

describe("middlewares/require-role — comparador en sombra (Bloque B, Fase 2, shadow, no cutover)", () => {
  it("invoca compareRequireRole en fire-and-forget, sin bloquear next() (no perceptible latency)", () => {
    let resolverPendiente: (() => void) | undefined;
    vi.mocked(shadowAuthorizationService.compareRequireRole).mockReturnValue(
      new Promise((resolve) => {
        resolverPendiente = () => resolve(undefined);
      }),
    );
    const req = reqConUsuario("ADMINISTRADOR");
    const next = vi.fn();

    requireRole("ADMINISTRADOR")(req, {} as Response, next);

    // `next()` ya se llamó de forma síncrona aunque la promesa del
    // comparador en sombra siga sin resolverse — la respuesta nunca lo espera.
    expect(next).toHaveBeenCalledWith();
    expect(shadowAuthorizationService.compareRequireRole).toHaveBeenCalledWith(
      "u1",
      ["ADMINISTRADOR"],
      true,
    );
    resolverPendiente?.();
  });

  it("también se invoca cuando el rol es denegado (legacyDecision=false)", () => {
    const req = reqConUsuario("VENDEDOR");
    const next = vi.fn();

    requireRole("ADMINISTRADOR")(req, {} as Response, next);

    expect(shadowAuthorizationService.compareRequireRole).toHaveBeenCalledWith(
      "u1",
      ["ADMINISTRADOR"],
      false,
    );
  });

  it("no se invoca cuando no hay usuario autenticado (nada que comparar)", () => {
    const req = reqConUsuario(undefined);
    const next = vi.fn();

    requireRole("ADMINISTRADOR")(req, {} as Response, next);

    expect(shadowAuthorizationService.compareRequireRole).not.toHaveBeenCalled();
  });
});


