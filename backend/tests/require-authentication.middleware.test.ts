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
  findActivasByUsuarioId: vi.fn(),
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
  it("ADMINISTRADOR resuelve empresaId=null (holding-wide) INCONDICIONALMENTE, incluso con Membresia propia", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1" } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(
      usuarioFalso({ rol: "ADMINISTRADOR" }),
    );
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ADMINISTRADOR", empresaId: "empresa-1" }),
    ]);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.empresaId).toBeNull();
  });

  it("SUPERVISOR resuelve empresaId=null (holding-wide) INCONDICIONALMENTE", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1" } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "SUPERVISOR" }));
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([]);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(req.user?.empresaId).toBeNull();
  });

  it("ASESOR resuelve el empresaId de SU PROPIA Membresia activa (rol equivalente)", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1" } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ASESOR" }));
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ASESOR", habilitadoParaVenta: false, empresaId: "empresa-A" }),
    ]);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(req.user?.empresaId).toBe("empresa-A");
  });

  it("VENDEDOR legado resuelve vía Membresia(ASESOR, habilitadoParaVenta=true), no vía una Membresia ASESOR sin habilitar", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1" } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "VENDEDOR" }));
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ASESOR", habilitadoParaVenta: false, empresaId: "empresa-X" }),
      membresiaFalsa({ rol: "ASESOR", habilitadoParaVenta: true, empresaId: "empresa-Y" }),
    ]);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(req.user?.empresaId).toBe("empresa-Y");
  });

  it("Scenario 'Client-supplied empresaId is ignored': el empresaId del claim del token NUNCA se usa, solo el resuelto server-side", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1",
      empresaId: "empresa-del-claim-no-confiable",
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ASESOR" }));
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([
      membresiaFalsa({ rol: "ASESOR", habilitadoParaVenta: false, empresaId: "empresa-resuelta" }),
    ]);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(req.user?.empresaId).toBe("empresa-resuelta");
    expect(req.user?.empresaId).not.toBe("empresa-del-claim-no-confiable");
  });

  it("TenantContext no resuelto (ninguna Membresia activa coincide con el rol legado): RECHAZA la petición con 403 (Bloque C follow-up, D2 gap closure — spec 'A request whose tenant context cannot be resolved MUST be rejected')", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1" } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ASESOR" }));
    vi.mocked(membresiaRepository.findActivasByUsuarioId).mockResolvedValue([]);
    const req = reqConToken();
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "contexto_empresa_no_resuelto", statusHttp: 403 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tenant_context_no_resuelto", usuarioId: "usuario-1" }),
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
    expect(membresiaRepository.findActivasByUsuarioId).not.toHaveBeenCalled();
  });
});
