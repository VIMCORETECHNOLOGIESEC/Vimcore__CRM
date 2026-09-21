import type { Membresia, Usuario } from "@prisma/client";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * holding-scoped-tenant-isolation (T1): the TenantContext each session type
 * runs under, on both the own-JWT and the gateway trust paths. Same mocking
 * style as `require-authentication.dual-mode.test.ts`.
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
vi.mock("../src/repositories/empresa.repository.js", () => ({ findByAuthCompanyId: vi.fn() }));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  findById: vi.fn(),
  findActivaByUsuarioAndEmpresa: vi.fn(),
}));
vi.mock("../src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// Membership reads run inside a bootstrap transaction in production; here the
// callback just receives a dummy tx. Everything else in prisma.js stays real.
vi.mock("../src/lib/prisma.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/prisma.js")>();
  return { ...actual, withBootstrapUsuarioGuc: vi.fn(async (_id: string, fn: (tx: unknown) => unknown) => fn({})) };
});

const { verifyAccessToken } = await import("../src/lib/jwt.js");
const usuarioRepository = await import("../src/repositories/usuario.repository.js");
const empresaRepository = await import("../src/repositories/empresa.repository.js");
const membresiaRepository = await import("../src/repositories/membresia.repository.js");
const { currentTenantContext } = await import("../src/lib/tenant-context.js");
const { requireAuthentication } = await import("../src/middlewares/require-authentication.middleware.js");

const SECRET = "s".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.CRM_GATEWAY_SECRET = SECRET;
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

function membresiaFalsa(): Membresia {
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
  };
}

function reqConHeaders(headers: Record<string, string>): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: lower, header: (name: string) => lower[name.toLowerCase()] } as unknown as Request;
}

/** Runs the middleware and captures the TenantContext active when `next` runs. */
async function run(req: Request) {
  let context: unknown;
  let error: unknown;
  const next = vi.fn((err?: unknown) => {
    error = err;
    context = currentTenantContext();
  });
  await requireAuthentication(req, {} as Response, next);
  return { context, error };
}

const gatewayHeaders = { "x-gateway-secret": SECRET, "x-gateway-user-id": "auth-usuario-1" };

describe("own-JWT path — TenantContext by session type", () => {
  function jwt(rol: string, extra: Record<string, unknown> = {}) {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "usuario-1", rol, sessionScope: "holding", type: "access", ...extra } as never);
  }

  it("ADMINISTRADOR_HOLDING gets holdingId in req.user and a holding context", async () => {
    jwt("ADMINISTRADOR_HOLDING");
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "ADMINISTRADOR_HOLDING", holdingId: "holding-1" }));
    const req = reqConHeaders({ authorization: "Bearer t" });

    const { context, error } = await run(req);

    expect(error).toBeUndefined();
    expect(req.user).toMatchObject({ sessionScope: "holding", empresaId: null, holdingId: "holding-1" });
    expect(context).toEqual({ holdingId: "holding-1" });
  });

  it("SUPERVISOR_HOLDING without holdingId is rejected 403 (fail-closed) and never runs next in a context", async () => {
    jwt("SUPERVISOR_HOLDING");
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "SUPERVISOR_HOLDING", holdingId: null }));
    const req = reqConHeaders({ authorization: "Bearer t" });

    const { context, error } = await run(req);

    expect(error).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(context).toBeUndefined();
    expect(req.user).toBeUndefined();
  });

  it.each(["ADMINISTRADOR", "SUPERVISOR"] as const)(
    "legacy %s holding session with holdingId gets a holding context",
    async (rol) => {
      jwt(rol);
      vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol, holdingId: "holding-1" }));
      const req = reqConHeaders({ authorization: "Bearer t" });

      const { context, error } = await run(req);

      expect(error).toBeUndefined();
      expect(req.user).toMatchObject({ sessionScope: "holding", empresaId: null, holdingId: "holding-1" });
      expect(context).toEqual({ holdingId: "holding-1" });
    },
  );

  it.each(["ADMINISTRADOR", "SUPERVISOR"] as const)(
    "legacy %s holding session without holdingId is rejected 403 (fail-closed)",
    async (rol) => {
      jwt(rol);
      vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol, holdingId: null }));
      const req = reqConHeaders({ authorization: "Bearer t" });

      const { context, error } = await run(req);

      expect(error).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
      expect(context).toBeUndefined();
      expect(req.user).toBeUndefined();
    },
  );

  it("SUPER_ADMIN keeps the unrestricted scope", async () => {
    jwt("SUPER_ADMIN");
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso({ rol: "SUPER_ADMIN" }));
    const req = reqConHeaders({ authorization: "Bearer t" });

    const { context, error } = await run(req);

    expect(error).toBeUndefined();
    expect(req.user?.holdingId).toBeUndefined();
    expect(context).toEqual({ unrestricted: true });
  });

  it("company user keeps the empresa context, unchanged", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "usuario-1", rol: "ASESOR", sessionScope: "company", membresiaId: "membresia-1", empresaId: "empresa-1", type: "access",
    } as never);
    vi.mocked(usuarioRepository.findById).mockResolvedValue(usuarioFalso());
    vi.mocked(membresiaRepository.findById).mockResolvedValue(membresiaFalsa());
    const req = reqConHeaders({ authorization: "Bearer t" });

    const { context, error } = await run(req);

    expect(error).toBeUndefined();
    expect(req.user).toMatchObject({ sessionScope: "company", empresaId: "empresa-1" });
    expect(req.user?.holdingId).toBeUndefined();
    expect(context).toEqual({ empresaId: "empresa-1" });
  });
});

describe("gateway trust path — TenantContext by session type", () => {
  it("holding user gets holdingId and a holding context", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso({ rol: "ADMINISTRADOR_HOLDING", holdingId: "holding-1" }));
    const req = reqConHeaders(gatewayHeaders);

    const { context, error } = await run(req);

    expect(error).toBeUndefined();
    expect(req.user).toMatchObject({ sessionScope: "holding", empresaId: null, holdingId: "holding-1" });
    expect(context).toEqual({ holdingId: "holding-1" });
  });

  it("holding user without holdingId is rejected 403 identidad_no_vinculada", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso({ rol: "SUPERVISOR_HOLDING", holdingId: null }));
    const req = reqConHeaders(gatewayHeaders);

    const { context, error } = await run(req);

    expect(error).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(context).toBeUndefined();
  });

  it("company user keeps the empresa context, unchanged", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso());
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue({ id: "empresa-1" } as never);
    vi.mocked(membresiaRepository.findActivaByUsuarioAndEmpresa).mockResolvedValue(membresiaFalsa());
    const req = reqConHeaders({ ...gatewayHeaders, "x-gateway-company-id": "auth-empresa-1" });

    const { context } = await run(req);

    expect(req.user).toMatchObject({ sessionScope: "company", empresaId: "empresa-1" });
    expect(context).toEqual({ empresaId: "empresa-1" });
  });
});
