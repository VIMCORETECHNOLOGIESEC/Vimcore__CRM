import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireRole } from "../src/middlewares/require-role.middleware.js";

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
