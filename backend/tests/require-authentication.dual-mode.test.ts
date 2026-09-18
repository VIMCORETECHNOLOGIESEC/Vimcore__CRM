import type { Empresa, Membresia, Usuario } from "@prisma/client";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * holding-admin-gateway-auth (transitional dual mode): `requireAuthentication`
 * accepts EITHER the gateway trust path (`X-Gateway-Secret` present) OR the
 * CRM JWT. Same unit-test style as `require-authentication.middleware.test.ts`
 * and `require-gateway-trust.middleware.test.ts`: repositories, jwt and env are
 * mocked; `lib/prisma.js` runs for real.
 */
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { CRM_GATEWAY_SECRET: undefined as string | undefined },
}));

vi.mock("../src/config/env.js", () => ({ env: mockEnv }));
vi.mock("../src/lib/jwt.js", () => ({ verifyAccessToken: vi.fn() }));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  findById: vi.fn(),
  findByAuthUserId: vi.fn(),
}));
vi.mock("../src/repositories/empresa.repository.js", () => ({
  findByAuthCompanyId: vi.fn(),
}));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  findById: vi.fn(),
  findActivaByUsuarioAndEmpresa: vi.fn(),
}));
vi.mock("../src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { verifyAccessToken } = await import("../src/lib/jwt.js");
const usuarioRepository = await import("../src/repositories/usuario.repository.js");
const empresaRepository = await import("../src/repositories/empresa.repository.js");
const membresiaRepository = await import("../src/repositories/membresia.repository.js");
const { requireAuthentication } = await import(
  "../src/middlewares/require-authentication.middleware.js"
);

const SECRET_VALIDO = "s".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.CRM_GATEWAY_SECRET = SECRET_VALIDO;
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
    authUserId: "auth-usuario-1",
    holdingId: null,
    ...overrides,
  } as Usuario;
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

function reqConHeaders(headers: Record<string, string>): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: lower,
    header(name: string) {
      return lower[name.toLowerCase()];
    },
  } as unknown as Request;
}

describe("requireAuthentication — gateway trust path takes precedence when X-Gateway-Secret is present", () => {
  it("valid secret: authenticates through the gateway and never touches the JWT", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
      usuarioFalso({ rol: "ADMINISTRADOR_HOLDING", holdingId: "holding-1" }),
    );
    const req = reqConHeaders({
      "x-gateway-secret": SECRET_VALIDO,
      "x-gateway-user-id": "auth-usuario-1",
      authorization: "Bearer token-que-se-ignora",
    });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ sessionScope: "holding", empresaId: null, rol: "ADMINISTRADOR_HOLDING" });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("company user: gateway path resolves the Membresia of the asserted company", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso());
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue({ id: "empresa-1" } as Empresa);
    vi.mocked(membresiaRepository.findActivaByUsuarioAndEmpresa).mockResolvedValue(membresiaFalsa());
    const req = reqConHeaders({
      "x-gateway-secret": SECRET_VALIDO,
      "x-gateway-user-id": "auth-usuario-1",
      "x-gateway-company-id": "auth-empresa-1",
    });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toMatchObject({ sessionScope: "company", empresaId: "empresa-1", membresiaId: "membresia-1" });
  });

  it("wrong secret with a VALID Bearer: rejected 401 gateway_no_autorizado, never falls back to the JWT", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1", sessionScope: "holding" } as never);
    const req = reqConHeaders({
      "x-gateway-secret": "secreto-invalido-no-coincide",
      "x-gateway-user-id": "auth-usuario-1",
      authorization: "Bearer token-valido",
    });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "gateway_no_autorizado", statusHttp: 401 });
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it("empty X-Gateway-Secret header counts as present: rejected, no JWT fallback", async () => {
    const req = reqConHeaders({ "x-gateway-secret": "", authorization: "Bearer token-valido" });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "gateway_no_autorizado", statusHttp: 401 });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("CRM_GATEWAY_SECRET unset (kill switch): a request sending the header is rejected, no JWT fallback", async () => {
    mockEnv.CRM_GATEWAY_SECRET = undefined;
    const req = reqConHeaders({
      "x-gateway-secret": SECRET_VALIDO,
      "x-gateway-user-id": "auth-usuario-1",
      authorization: "Bearer token-valido",
    });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "gateway_no_autorizado", statusHttp: 401 });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("secret present but identity not linked: single generic identidad_no_vinculada", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(null);
    const req = reqConHeaders({ "x-gateway-secret": SECRET_VALIDO, "x-gateway-user-id": "auth-desconocido" });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
  });
});

describe("requireAuthentication — JWT path unchanged when no gateway secret header is sent", () => {
  it("valid Bearer still authenticates through the JWT", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1",
      rol: "ADMINISTRADOR",
      sessionScope: "holding",
      type: "access",
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ADMINISTRADOR" }));
    const req = reqConHeaders({ authorization: "Bearer token-valido" });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.sessionScope).toBe("holding");
    expect(usuarioRepository.findByAuthUserId).not.toHaveBeenCalled();
  });

  it("identity headers WITHOUT the secret are never honored: 401 no_autenticado, no lookup by authUserId", async () => {
    const req = reqConHeaders({
      "x-gateway-user-id": "auth-usuario-1",
      "x-gateway-company-id": "auth-empresa-1",
    });
    const next = vi.fn();

    await requireAuthentication(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "no_autenticado", statusHttp: 401 });
    expect(usuarioRepository.findByAuthUserId).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});
