import type { Membresia, Usuario } from "@prisma/client";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bloque C (D2, spec "Request-scoped tenant context").
 * Unit test — mismo estilo que `require-role.middleware.test.ts`: mockea
 * las dependencias de I/O y ejercita `requireAuthentication` directo.
 *
 * Bloque C follow-up (D2 gap closure): el spec exige rechazar la petición
 * cuando el TenantContext no resuelve — ahora conectado de verdad. La
 * desviación de Fase 1/Stage 1 (degradar a holding-wide con un log de
 * sombra) queda cerrada porque `usuarios.service.ts::createUsuario` ya
 * garantiza que todo `ASESOR`/`VENDEDOR` nuevo nace con su `Membresia`
 * (misma transacción) — el caso "ninguna Membresia activa coincide con el
 * rol legado" solo puede darse ahora por manipulación directa de datos, no
 * por un flujo normal de la aplicación.
 */
vi.mock("../src/lib/jwt.js", () => ({
  verifyAccessToken: vi.fn(),
}));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  findById: vi.fn(),
}));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  findById: vi.fn(),
}));
vi.mock("../src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { verifyAccessToken } = await import("../src/lib/jwt.js");
const usuarioRepository = await import("../src/repositories/usuario.repository.js");
const membresiaRepository = await import("../src/repositories/membresia.repository.js");
const { logger } = await import("../src/lib/logger.js");
const { requireAuthentication } = await import(
  "../src/middlewares/require-authentication.middleware.js"
);

beforeEach(() => {
  vi.clearAllMocks();
});

function usuarioFalso(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: "usuario-1",
    nombre: "Test",
    correo: "t@t.com",
    passwordHash: "x",
    rol: "ASESOR",
    activo: true,
    ultimaAsignacionEn: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    ...overrides,
  };
}

function membresiaFalsa(overrides: Partial<Membresia> = {}): Membresia {
  return {
    id: "membresia-1",
    usuarioId: "usuario-1",
    empresaId: "empresa-1",
    rol: "ASESOR",
    habilitadoParaVenta: false,
    correo: null,
    passwordHash: null,
    activa: true,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    ...overrides,
  };
}

function reqConToken(payload: Record<string, unknown> = {}): Request {
  void payload;
  return { headers: { authorization: "Bearer token-valido" } } as unknown as Request;
}

describe("middlewares/require-authentication — TenantContext (Bloque C, D2)", () => {
  it("una sesión holding explícita omite membresiaId y resuelve empresaId=null", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1",
      rol: "ADMINISTRADOR",
      sessionScope: "holding",
      type: "access",
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(
      usuarioFalso({ rol: "ADMINISTRADOR" }),
    );
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.empresaId).toBeNull();
    expect(req.user?.sessionScope).toBe("holding");
    expect(membresiaRepository.findById).not.toHaveBeenCalled();
  });

  it("un ADMINISTRADOR con membresía válida permanece acotado a esa empresa", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1",
      rol: "ADMINISTRADOR",
      sessionScope: "company",
      membresiaId: "membresia-1",
      empresaId: "empresa-1",
      type: "access",
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ADMINISTRADOR" }));
    vi.mocked(membresiaRepository.findById).mockResolvedValue(
      membresiaFalsa({ rol: "ADMINISTRADOR" }),
    );
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.empresaId).toBe("empresa-1");
    expect(req.user?.membresiaId).toBe("membresia-1");
  });

  it("un portador (Usuario.correo sintético) expone en req.user el correo real de la Membresia", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1",
      rol: "ASESOR",
      sessionScope: "company",
      membresiaId: "membresia-1",
      empresaId: "empresa-1",
      type: "access",
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(
      usuarioFalso({
        rol: "ASESOR",
        correo: "portador-asesor-empresa-1-abc123@no-login.crm.local",
      }),
    );
    vi.mocked(membresiaRepository.findById).mockResolvedValue(
      membresiaFalsa({ rol: "ASESOR", correo: "ana@empresa.local" }),
    );
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.correo).toBe("ana@empresa.local");
  });

  it("resuelve únicamente la membresía identificada por el JWT", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1",
      rol: "ASESOR",
      sessionScope: "company",
      membresiaId: "membresia-objetivo",
      empresaId: "empresa-A",
      type: "access",
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ASESOR" }));
    vi.mocked(membresiaRepository.findById).mockResolvedValue(
      membresiaFalsa({ id: "membresia-objetivo", empresaId: "empresa-A" }),
    );
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(req.user?.empresaId).toBe("empresa-A");
    expect(membresiaRepository.findById).toHaveBeenCalledWith(
      "membresia-objetivo",
      expect.anything(),
    );
  });

  it.each([
    ["sin membresiaId", { membresiaId: undefined }, membresiaFalsa()],
    ["inexistente", {}, null],
    ["ajena", {}, membresiaFalsa({ usuarioId: "usuario-2" })],
    ["revocada", {}, membresiaFalsa({ activa: false })],
    ["empresa inconsistente", {}, membresiaFalsa({ empresaId: "empresa-B" })],
    ["rol inconsistente", {}, membresiaFalsa({ rol: "SUPERVISOR" })],
  ])("rechaza con 401 una sesión company %s", async (_caso, overrides, membresia) => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1",
      rol: "ASESOR",
      sessionScope: "company",
      membresiaId: "membresia-1",
      empresaId: "empresa-1",
      type: "access",
      ...overrides,
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ASESOR" }));
    vi.mocked(membresiaRepository.findById).mockResolvedValue(membresia);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "no_autenticado", statusHttp: 401 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tenant_context_rejected", usuarioId: "usuario-1" }),
      expect.any(String),
    );
  });

  it("401 cuando el usuario no existe o está inactivo (comportamiento previo sin cambios)", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1" } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(null);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "no_autenticado", statusHttp: 401 });
    expect(membresiaRepository.findById).not.toHaveBeenCalled();
  });
});
