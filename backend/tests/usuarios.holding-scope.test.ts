import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * holding-scoped-tenant-isolation (T5a): usuarios provisioning and listing are
 * confined to the caller's holding. Non-DB: repositories are mocked.
 */
vi.mock("../src/lib/prisma.js", () => ({
  runInTransaction: vi.fn(async (_c: unknown, fn: (tx: unknown) => unknown) => fn({})),
  USUARIOS_TRANSACTION_BOUNDS: {},
}));
vi.mock("../src/lib/password.js", () => ({ hashPassword: vi.fn(async () => "hash") }));
vi.mock("../src/repositories/empresa.repository.js", () => ({ findById: vi.fn() }));
vi.mock("../src/repositories/lead.repository.js", () => ({}));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  assertCorreoDisponible: vi.fn(),
  createMembresia: vi.fn(),
  createMembresiaConCredencial: vi.fn(),
}));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  DOMINIO_CORREO_PORTADOR: "no-login.crm.local",
  createUsuario: vi.fn(),
  existsEnEmpresa: vi.fn(),
  existsEnHolding: vi.fn(),
  findPublicById: vi.fn(),
  findResponsablesActivosPorRol: vi.fn(),
  findUsuarios: vi.fn(),
  usuarioEnHoldingWhere: (holdingId: string) => ({ OR: [{ holdingId }] }),
}));
vi.mock("../src/services/asignacion.service.js", () => ({}));
vi.mock("../src/services/committed-events.service.js", () => ({ publishCommittedEvents: vi.fn() }));
vi.mock("../src/lib/metricas-broadcast.js", () => ({ scheduleMetricasBroadcast: vi.fn() }));
vi.mock("../src/services/presencia.service.js", () => ({ getPresenceForUsuarios: vi.fn(() => new Map()) }));

import { postEmpresaAdministrador, postEmpresaAsesor, postEmpresaSupervisor } from "../src/controllers/usuarios.controller.js";
import { GLOBAL_EMPRESA_SCOPE, resolveEmpresaScope } from "../src/lib/holding-scope.js";
import * as empresaRepository from "../src/repositories/empresa.repository.js";
import * as membresiaRepository from "../src/repositories/membresia.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import {
  createEmpresaAdministrador,
  createUsuario,
  findResponsables,
  findUsuarioById,
  findUsuarios,
} from "../src/services/usuarios.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";

const HOLDING_A = "11111111-1111-4111-8111-111111111111";
const HOLDING_B = "22222222-2222-4222-8222-222222222222";
const EMPRESA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPRESA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const empresaRepo = vi.mocked(empresaRepository);
const usuarioRepo = vi.mocked(usuarioRepository);
const membresiaRepo = vi.mocked(membresiaRepository);

function actor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "u-1",
    nombre: "Admin",
    correo: "a@a.com",
    rol: "ADMINISTRADOR_HOLDING",
    sessionScope: "holding",
    empresaId: null,
    holdingId: HOLDING_A,
    ...overrides,
  } as AuthenticatedUser;
}

const empresa = (id: string, holdingId: string | null) => ({ id, holdingId }) as never;

const body = { nombre: "X", correo: "x@x.com", password: "clave-larga-123456" };

function makeReq(user: AuthenticatedUser, empresaId: string): Request {
  return { user, params: { empresaId }, body, query: {} } as unknown as Request;
}
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as unknown as Response;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveEmpresaScope", () => {
  it("uses the session holdingId", () => {
    expect(resolveEmpresaScope(actor())).toEqual({ holdingId: HOLDING_A });
  });
  it("SUPER_ADMIN gets the explicit global scope", () => {
    expect(resolveEmpresaScope(actor({ rol: "SUPER_ADMIN", holdingId: undefined }))).toEqual(GLOBAL_EMPRESA_SCOPE);
  });
  it("holding-wide non-SUPER_ADMIN without holdingId fails closed", () => {
    expect(() => resolveEmpresaScope(actor({ rol: "ADMINISTRADOR", holdingId: undefined }))).toThrowError(
      expect.objectContaining({ code: "identidad_no_vinculada", statusHttp: 403 }),
    );
  });
});

describe("POST /empresas/:empresaId/{administradores,supervisores,asesores}", () => {
  it.each([
    ["administradores", postEmpresaAdministrador],
    ["supervisores", postEmpresaSupervisor],
    ["asesores", postEmpresaAsesor],
  ] as const)("%s: another holding's empresa -> 404 and no write", async (_n, handler) => {
    empresaRepo.findById.mockResolvedValue(empresa(EMPRESA_B, HOLDING_B));
    await expect(handler(makeReq(actor(), EMPRESA_B), res())).rejects.toMatchObject({
      code: "empresa_no_encontrada",
      statusHttp: 404,
    });
    expect(usuarioRepo.createUsuario).not.toHaveBeenCalled();
    expect(membresiaRepo.createMembresiaConCredencial).not.toHaveBeenCalled();
  });

  it("empresa without holding is hidden from a holding session (404, no write)", async () => {
    empresaRepo.findById.mockResolvedValue(empresa(EMPRESA_B, null));
    await expect(handlerCall(actor())).rejects.toMatchObject({ code: "empresa_no_encontrada" });
    expect(usuarioRepo.createUsuario).not.toHaveBeenCalled();
  });

  it("own-holding empresa proceeds to the write", async () => {
    empresaRepo.findById.mockResolvedValue(empresa(EMPRESA_A, HOLDING_A));
    usuarioRepo.createUsuario.mockResolvedValue({ id: "n", nombre: "X", rol: "ADMINISTRADOR", activo: true } as never);
    membresiaRepo.createMembresiaConCredencial.mockResolvedValue({
      id: "m", usuarioId: "n", empresaId: EMPRESA_A, rol: "ADMINISTRADOR", activa: true, correo: "x@x.com",
    } as never);
    await createEmpresaAdministrador(EMPRESA_A, body, { holdingId: HOLDING_A });
    expect(usuarioRepo.createUsuario).toHaveBeenCalledTimes(1);
  });

  it("SUPER_ADMIN (global scope) is exempt", async () => {
    empresaRepo.findById.mockResolvedValue(empresa(EMPRESA_B, HOLDING_B));
    usuarioRepo.createUsuario.mockResolvedValue({ id: "n", nombre: "X", rol: "ADMINISTRADOR", activo: true } as never);
    membresiaRepo.createMembresiaConCredencial.mockResolvedValue({
      id: "m", usuarioId: "n", empresaId: EMPRESA_B, rol: "ADMINISTRADOR", activa: true, correo: "x@x.com",
    } as never);
    await createEmpresaAdministrador(EMPRESA_B, body, GLOBAL_EMPRESA_SCOPE);
    expect(usuarioRepo.createUsuario).toHaveBeenCalledTimes(1);
  });

  it("the scope comes from the session, never from the request body/params", async () => {
    empresaRepo.findById.mockResolvedValue(empresa(EMPRESA_B, HOLDING_B));
    const req = { user: actor(), params: { empresaId: EMPRESA_B }, body: { ...body, holdingId: HOLDING_B }, query: {} } as unknown as Request;
    await expect(postEmpresaAdministrador(req, res())).rejects.toMatchObject({ code: "empresa_no_encontrada" });
  });

  it("scope is required: omitting it fails closed at runtime (and is a type error)", async () => {
    empresaRepo.findById.mockResolvedValue(empresa(EMPRESA_B, HOLDING_B));
    // @ts-expect-error scope is a required argument
    const call = createEmpresaAdministrador(EMPRESA_B, body);
    await expect(call).rejects.toBeInstanceOf(Error);
    expect(usuarioRepo.createUsuario).not.toHaveBeenCalled();
  });

  function handlerCall(user: AuthenticatedUser) {
    return postEmpresaAdministrador(makeReq(user, EMPRESA_B), res());
  }
});

describe("POST /usuarios (holding-wide actor)", () => {
  it("membresia in another holding's empresa -> 404 and no write", async () => {
    empresaRepo.findById.mockResolvedValue(empresa(EMPRESA_B, HOLDING_B));
    await expect(
      createUsuario(actor(), { nombre: "A", correo: "a@x.com", password: "clave-larga-123456", rol: "ASESOR", empresaId: EMPRESA_B }),
    ).rejects.toMatchObject({ code: "empresa_no_encontrada", statusHttp: 404 });
    expect(usuarioRepo.createUsuario).not.toHaveBeenCalled();
    expect(membresiaRepo.createMembresia).not.toHaveBeenCalled();
  });
});

describe("usuarios listing / lookup confinement", () => {
  const query = { pagina: 1, limite: 25, direccion: "desc" } as never;

  it("findUsuarios adds the holding filter for a holding session", async () => {
    usuarioRepo.findUsuarios.mockResolvedValue({ usuarios: [], total: 0 } as never);
    await findUsuarios(actor(), query);
    expect(usuarioRepo.findUsuarios).toHaveBeenCalledWith(
      expect.objectContaining({ AND: [{ OR: [{ holdingId: HOLDING_A }] }] }),
      expect.anything(),
    );
  });

  it("findUsuarios drill-down empresa is constrained to the holding", async () => {
    usuarioRepo.findUsuarios.mockResolvedValue({ usuarios: [], total: 0 } as never);
    await findUsuarios(actor(), { ...(query as object), empresaId: EMPRESA_B } as never);
    expect(usuarioRepo.findUsuarios).toHaveBeenCalledWith(
      expect.objectContaining({
        membresias: { some: { empresaId: EMPRESA_B, activa: true, empresa: { holdingId: HOLDING_A } } },
      }),
      expect.anything(),
    );
  });

  it("findUsuarios for SUPER_ADMIN has no holding filter", async () => {
    usuarioRepo.findUsuarios.mockResolvedValue({ usuarios: [], total: 0 } as never);
    await findUsuarios(actor({ rol: "SUPER_ADMIN", holdingId: undefined }), query);
    expect(usuarioRepo.findUsuarios.mock.calls[0]?.[0]).not.toHaveProperty("AND");
  });

  it("findUsuarioById -> 404 for a usuario outside the holding", async () => {
    usuarioRepo.existsEnHolding.mockResolvedValue(false);
    await expect(findUsuarioById(actor(), "u-x")).rejects.toMatchObject({ code: "usuario_no_encontrado" });
    expect(usuarioRepo.existsEnHolding).toHaveBeenCalledWith("u-x", HOLDING_A, undefined);
    expect(usuarioRepo.findPublicById).not.toHaveBeenCalled();
  });

  it("findResponsables passes the holding to the repository", async () => {
    usuarioRepo.findResponsablesActivosPorRol.mockResolvedValue([]);
    await findResponsables(actor(), { rol: "ASESOR" } as never);
    expect(usuarioRepo.findResponsablesActivosPorRol).toHaveBeenCalledWith("ASESOR", undefined, HOLDING_A);
  });

  it("holding-wide legacy session without holdingId fails closed on listing", async () => {
    await expect(findUsuarios(actor({ rol: "ADMINISTRADOR", holdingId: undefined }), query)).rejects.toMatchObject({
      code: "identidad_no_vinculada",
    });
    expect(usuarioRepo.findUsuarios).not.toHaveBeenCalled();
  });
});
