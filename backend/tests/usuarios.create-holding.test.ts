import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * holding-scoped-tenant-isolation (T5c): `createUsuario` binds a new
 * holding-wide user to the ACTOR's holding (session only) and rejects the case
 * that would create a user that can never log in. Non-DB: repositories mocked.
 */
vi.mock("../src/lib/prisma.js", () => ({
  runInTransaction: vi.fn(async (_c: unknown, fn: (tx: unknown) => unknown) => fn({})),
  USUARIOS_TRANSACTION_BOUNDS: {},
}));
vi.mock("../src/lib/password.js", () => ({ hashPassword: vi.fn(async () => "hash") }));
vi.mock("../src/repositories/empresa.repository.js", () => ({ findById: vi.fn() }));
vi.mock("../src/repositories/holding.repository.js", () => ({ findById: vi.fn() }));
vi.mock("../src/repositories/lead.repository.js", () => ({}));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  assertCorreoDisponible: vi.fn(),
  createMembresia: vi.fn(),
  createMembresiaConCredencial: vi.fn(),
}));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  DOMINIO_CORREO_PORTADOR: "no-login.crm.local",
  createUsuario: vi.fn(async (data: unknown) => ({ id: "new-user", ...(data as object) })),
}));
vi.mock("../src/services/asignacion.service.js", () => ({}));
vi.mock("../src/services/committed-events.service.js", () => ({ publishCommittedEvents: vi.fn() }));
vi.mock("../src/lib/metricas-broadcast.js", () => ({ scheduleMetricasBroadcast: vi.fn() }));
vi.mock("../src/services/presencia.service.js", () => ({ getPresenceForUsuarios: vi.fn(() => new Map()) }));

import * as holdingRepository from "../src/repositories/holding.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import { createUsuario } from "../src/services/usuarios.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";

const HOLDING_A = "11111111-1111-4111-8111-111111111111";
const createRepo = vi.mocked(usuarioRepository.createUsuario);

function actor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "actor-1",
    nombre: "Actor",
    correo: "actor@test.local",
    rol: "ADMINISTRADOR",
    sessionScope: "holding",
    empresaId: null,
    holdingId: HOLDING_A,
    ...overrides,
  };
}

const input = (rol: "ADMINISTRADOR" | "SUPERVISOR" | "SUPERVISOR_HOLDING" | "SUPER_ADMIN") => ({
  nombre: "Nuevo",
  correo: "nuevo@test.local",
  password: "clave-123456-larga",
  rol,
});

const HOLDING_B = "22222222-2222-4222-8222-222222222222";
const holdingFind = vi.mocked(holdingRepository.findById);

beforeEach(() => {
  vi.clearAllMocks();
  holdingFind.mockResolvedValue({ id: HOLDING_B } as never);
});

describe("createUsuario — holding inheritance (T5c)", () => {
  it.each(["ADMINISTRADOR", "SUPERVISOR", "SUPERVISOR_HOLDING"] as const)(
    "%s created by a holding actor inherits the actor's holdingId",
    async (rol) => {
      await createUsuario(actor(), input(rol));
      expect(createRepo).toHaveBeenCalledWith(expect.objectContaining({ rol, holdingId: HOLDING_A }), expect.anything());
    },
  );

  it("ignores a holdingId smuggled in the request body", async () => {
    await createUsuario(actor(), { ...input("ADMINISTRADOR"), holdingId: "99999999-9999-4999-8999-999999999999" } as never);
    expect(createRepo).toHaveBeenCalledWith(expect.objectContaining({ holdingId: HOLDING_A }), expect.anything());
  });

  it.each(["ADMINISTRADOR", "SUPERVISOR", "SUPERVISOR_HOLDING"] as const)(
    "%s created by an actor without holdingId is rejected 400 holding_requerido and nothing is persisted",
    async (rol) => {
      await expect(
        createUsuario(actor({ rol: "SUPER_ADMIN", holdingId: null }), input(rol)),
      ).rejects.toMatchObject({ code: "holding_requerido", statusHttp: 400 });
      expect(createRepo).not.toHaveBeenCalled();
    },
  );

  it("a company-scoped actor cannot create a holding-wide user either", async () => {
    await expect(
      createUsuario(actor({ sessionScope: "company", empresaId: "e-1", holdingId: undefined }), input("SUPERVISOR")),
    ).rejects.toMatchObject({ code: "holding_requerido" });
    expect(createRepo).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN needs no holding (platform-wide, never linked)", async () => {
    await createUsuario(actor({ rol: "SUPER_ADMIN", holdingId: null }), input("SUPER_ADMIN"));
    const data = createRepo.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(data).not.toHaveProperty("holdingId");
  });
});

describe("createUsuario — SUPER_ADMIN chooses the holding (T7)", () => {
  const superAdmin = () => actor({ rol: "SUPER_ADMIN", holdingId: null });

  it("SUPER_ADMIN + holdingId creates the holding-wide user in that holding", async () => {
    await createUsuario(superAdmin(), { ...input("ADMINISTRADOR"), holdingId: HOLDING_B });
    expect(holdingFind).toHaveBeenCalledWith(HOLDING_B);
    expect(createRepo).toHaveBeenCalledWith(expect.objectContaining({ holdingId: HOLDING_B }), expect.anything());
  });

  it("SUPER_ADMIN without holdingId gets 400 holding_requerido", async () => {
    await expect(createUsuario(superAdmin(), input("SUPERVISOR"))).rejects.toMatchObject({
      code: "holding_requerido",
      statusHttp: 400,
    });
    expect(createRepo).not.toHaveBeenCalled();
  });

  it("SUPER_ADMIN with an unknown holding gets 404 and nothing is persisted", async () => {
    holdingFind.mockResolvedValue(null);
    await expect(
      createUsuario(superAdmin(), { ...input("ADMINISTRADOR"), holdingId: HOLDING_B }),
    ).rejects.toMatchObject({ code: "holding_no_encontrado", statusHttp: 404 });
    expect(createRepo).not.toHaveBeenCalled();
  });

  it("a non-SUPER_ADMIN body holdingId cannot override the actor's own holding", async () => {
    await createUsuario(actor(), { ...input("ADMINISTRADOR"), holdingId: HOLDING_B });
    expect(holdingFind).not.toHaveBeenCalled();
    expect(createRepo).toHaveBeenCalledWith(expect.objectContaining({ holdingId: HOLDING_A }), expect.anything());
  });

  it("company-role creation by SUPER_ADMIN is unaffected by holdingId", async () => {
    const empresaRepo = await import("../src/repositories/empresa.repository.js");
    vi.mocked(empresaRepo.findById).mockResolvedValue({ id: "e-1", holdingId: HOLDING_B } as never);
    await createUsuario(superAdmin(), {
      ...input("ADMINISTRADOR"),
      rol: "ASESOR",
      empresaId: "e-1",
      holdingId: HOLDING_B,
    } as never);
    expect(holdingFind).not.toHaveBeenCalled();
    const data = createRepo.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(data).not.toHaveProperty("holdingId");
  });
});
