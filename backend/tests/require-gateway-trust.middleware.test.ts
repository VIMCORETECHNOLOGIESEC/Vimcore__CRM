import type { Empresa, Membresia, Usuario } from "@prisma/client";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * crm-gateway-proxy (CRM Gateway Trust, design.md): unit test -- mismo estilo
 * que `require-authentication.middleware.test.ts` (mockea las dependencias de
 * I/O y ejercita `requireGatewayTrust` directo). `lib/prisma.js` NO se mockea
 * a propósito, mismo criterio que ese archivo: `withBootstrapUsuarioGuc`/
 * `runWithTenantContext` corren de verdad (transacción real contra la BD de
 * test), solo las lecturas de repositorio quedan mockeadas.
 *
 * `config/env.js` SÍ se mockea -- a diferencia de `require-authentication`,
 * este middleware lee `env.CRM_GATEWAY_SECRET` en cada invocación (nunca lo
 * desestructura al importar), así que reasignar `mockEnv.CRM_GATEWAY_SECRET`
 * entre tests alcanza para simular tanto un secreto configurado como el kill
 * switch de rollback (`config/env.ts`, secreto sin setear).
 */
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { CRM_GATEWAY_SECRET: undefined as string | undefined },
}));

vi.mock("../src/config/env.js", () => ({ env: mockEnv }));
vi.mock("../src/repositories/empresa.repository.js", () => ({
  findByAuthCompanyId: vi.fn(),
}));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  findByAuthUserId: vi.fn(),
}));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  findActivaByUsuarioAndEmpresa: vi.fn(),
}));

const empresaRepository = await import("../src/repositories/empresa.repository.js");
const usuarioRepository = await import("../src/repositories/usuario.repository.js");
const membresiaRepository = await import("../src/repositories/membresia.repository.js");
const { requireGatewayTrust } = await import(
  "../src/middlewares/require-gateway-trust.middleware.js"
);

const SECRET_VALIDO = "s".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.CRM_GATEWAY_SECRET = SECRET_VALIDO;
});

function empresaFalsa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id: "empresa-1",
    nombre: "Empresa gateway trust",
    creadoEn: new Date(),
    holdingId: null,
    colorPrimario: null,
    colorSecundario: null,
    logoUrl: null,
    authCompanyId: "auth-empresa-1",
    ...overrides,
  };
}

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

function reqConHeaders(
  overrides: Partial<{ secret: string; companyId: string; userId: string }> = {},
): Request {
  const headers: Record<string, string> = {};
  if (overrides.secret !== undefined) headers["x-gateway-secret"] = overrides.secret;
  if (overrides.companyId !== undefined) headers["x-gateway-company-id"] = overrides.companyId;
  if (overrides.userId !== undefined) headers["x-gateway-user-id"] = overrides.userId;

  return {
    headers,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

const HEADERS_VALIDOS = { secret: SECRET_VALIDO, companyId: "auth-empresa-1", userId: "auth-usuario-1" };

describe("middlewares/require-gateway-trust — INV-4 (secreto compartido)", () => {
  it("401 gateway_no_autorizado: falta el encabezado X-Gateway-Secret", async () => {
    const req = reqConHeaders({ companyId: "auth-empresa-1", userId: "auth-usuario-1" });
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "gateway_no_autorizado", statusHttp: 401 });
    expect(req.user).toBeUndefined();
    expect(empresaRepository.findByAuthCompanyId).not.toHaveBeenCalled();
  });

  it("401 gateway_no_autorizado: X-Gateway-Secret no coincide (comparación en tiempo constante, no ===)", async () => {
    const req = reqConHeaders({ ...HEADERS_VALIDOS, secret: "secreto-invalido-no-coincide" });
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "gateway_no_autorizado", statusHttp: 401 });
    expect(empresaRepository.findByAuthCompanyId).not.toHaveBeenCalled();
  });

  it("401 gateway_no_autorizado: CRM_GATEWAY_SECRET sin configurar (kill switch de rollback)", async () => {
    mockEnv.CRM_GATEWAY_SECRET = undefined;
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "gateway_no_autorizado", statusHttp: 401 });
  });
});

describe("middlewares/require-gateway-trust — INV-1 (resolución de identidad falla cerrado)", () => {
  it("403 identidad_no_vinculada: X-Gateway-Company-Id no matchea ningún authCompanyId", async () => {
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(null);
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso());
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(req.user).toBeUndefined();
    expect(membresiaRepository.findActivaByUsuarioAndEmpresa).not.toHaveBeenCalled();
  });

  it("403 identidad_no_vinculada: X-Gateway-User-Id no matchea ningún authUserId", async () => {
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(empresaFalsa());
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(null);
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
  });

  it("403 identidad_no_vinculada: el Usuario linkeado existe pero está inactivo", async () => {
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(empresaFalsa());
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso({ activo: false }));
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(membresiaRepository.findActivaByUsuarioAndEmpresa).not.toHaveBeenCalled();
  });

  it("403 identidad_no_vinculada: Empresa y Usuario linkeados pero sin Membresia activa entre ellos", async () => {
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(empresaFalsa());
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso());
    vi.mocked(membresiaRepository.findActivaByUsuarioAndEmpresa).mockResolvedValue(null);
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(req.user).toBeUndefined();
  });
});

describe("middlewares/require-gateway-trust — happy path puebla req.user + TenantContext", () => {
  it("identidad resuelta: req.user queda en sessionScope company, empresaId de la Membresia, next() sin error", async () => {
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(empresaFalsa({ id: "empresa-1" }));
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
      usuarioFalso({ id: "usuario-1", rol: "ADMINISTRADOR" }),
    );
    vi.mocked(membresiaRepository.findActivaByUsuarioAndEmpresa).mockResolvedValue(
      membresiaFalsa({ id: "membresia-1", usuarioId: "usuario-1", empresaId: "empresa-1", rol: "ADMINISTRADOR" }),
    );
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({
      id: "usuario-1",
      nombre: "Test",
      correo: "t@t.com",
      rol: "ADMINISTRADOR",
      sessionScope: "company",
      membresiaId: "membresia-1",
      empresaId: "empresa-1",
    });
  });

  it("un portador (Usuario.correo sintético) expone en req.user el correo real de la Membresia", async () => {
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(empresaFalsa());
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
      usuarioFalso({ correo: "portador-asesor-empresa-1-abc123@no-login.crm.local" }),
    );
    vi.mocked(membresiaRepository.findActivaByUsuarioAndEmpresa).mockResolvedValue(
      membresiaFalsa({ correo: "ana@empresa.local" }),
    );
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.correo).toBe("ana@empresa.local");
  });

  it("a company ADMINISTRADOR (single empresa) stays company-scoped via gateway trust", async () => {
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(empresaFalsa());
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
      usuarioFalso({ rol: "ADMINISTRADOR" }),
    );
    vi.mocked(membresiaRepository.findActivaByUsuarioAndEmpresa).mockResolvedValue(
      membresiaFalsa({ rol: "ADMINISTRADOR" }),
    );
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(req.user?.sessionScope).toBe("company");
    expect(req.user?.empresaId).not.toBeNull();
  });
});

describe("middlewares/require-gateway-trust — holding scope (holding-admin-gateway-auth)", () => {
  it.each(["ADMINISTRADOR_HOLDING", "SUPERVISOR_HOLDING"] as const)(
    "%s: holding scope, empresaId null, no company header and no Membresia needed",
    async (rol) => {
      vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
        usuarioFalso({ id: "usuario-h", rol, holdingId: "holding-1" }),
      );
      const req = reqConHeaders({ secret: SECRET_VALIDO, userId: "auth-usuario-1" });
      const next = vi.fn();

      await requireGatewayTrust(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual({
        id: "usuario-h",
        nombre: "Test",
        correo: "t@t.com",
        rol,
        sessionScope: "holding",
        empresaId: null,
      });
      expect(empresaRepository.findByAuthCompanyId).not.toHaveBeenCalled();
      expect(membresiaRepository.findActivaByUsuarioAndEmpresa).not.toHaveBeenCalled();
    },
  );

  it("a company header sent by a holding user is ignored (scope stays holding)", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
      usuarioFalso({ rol: "ADMINISTRADOR_HOLDING", holdingId: "holding-1" }),
    );
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user?.sessionScope).toBe("holding");
    expect(req.user?.empresaId).toBeNull();
    expect(empresaRepository.findByAuthCompanyId).not.toHaveBeenCalled();
  });

  it("403 identidad_no_vinculada: holding role without Usuario.holdingId", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
      usuarioFalso({ rol: "ADMINISTRADOR_HOLDING", holdingId: null }),
    );
    const req = reqConHeaders({ secret: SECRET_VALIDO, userId: "auth-usuario-1" });
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(req.user).toBeUndefined();
  });

  it("403 identidad_no_vinculada: inactive holding user", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(
      usuarioFalso({ rol: "ADMINISTRADOR_HOLDING", holdingId: "holding-1", activo: false }),
    );
    const req = reqConHeaders({ secret: SECRET_VALIDO, userId: "auth-usuario-1" });
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
  });

  it("403 identidad_no_vinculada: company user without company header", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso({ rol: "ADMINISTRADOR" }));
    const req = reqConHeaders({ secret: SECRET_VALIDO, userId: "auth-usuario-1" });
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(req.user).toBeUndefined();
  });

  it("403 identidad_no_vinculada: asserted company where the user has no active Membresia (company mismatch)", async () => {
    vi.mocked(usuarioRepository.findByAuthUserId).mockResolvedValue(usuarioFalso({ rol: "ASESOR" }));
    vi.mocked(empresaRepository.findByAuthCompanyId).mockResolvedValue(empresaFalsa({ id: "empresa-otra" }));
    vi.mocked(membresiaRepository.findActivaByUsuarioAndEmpresa).mockResolvedValue(null);
    const req = reqConHeaders(HEADERS_VALIDOS);
    const next = vi.fn();

    await requireGatewayTrust(req, {} as Response, next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
    expect(membresiaRepository.findActivaByUsuarioAndEmpresa).toHaveBeenCalledWith(
      "usuario-1",
      "empresa-otra",
      expect.anything(),
    );
  });
});
