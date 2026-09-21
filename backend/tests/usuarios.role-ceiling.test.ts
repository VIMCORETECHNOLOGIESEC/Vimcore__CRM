import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * holding-scoped-tenant-isolation (T5b): SUPER_ADMIN (and ADMINISTRADOR_HOLDING)
 * cannot be created, assigned or edited by a lower role. Non-DB: repositories mocked.
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
  createUsuario: vi.fn(async (data: unknown) => ({ id: "new-user", ...(data as object) })),
  updateUsuario: vi.fn(async (id: string, data: unknown) => ({ id, ...(data as object) })),
  existsEnHolding: vi.fn(async () => true),
  findPublicById: vi.fn(),
}));
vi.mock("../src/services/asignacion.service.js", () => ({}));
vi.mock("../src/services/committed-events.service.js", () => ({ publishCommittedEvents: vi.fn() }));
vi.mock("../src/lib/metricas-broadcast.js", () => ({ scheduleMetricasBroadcast: vi.fn() }));
vi.mock("../src/services/presencia.service.js", () => ({ getPresenceForUsuarios: vi.fn(() => new Map()) }));

import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import { createUsuario, updateUsuario } from "../src/services/usuarios.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";

const HOLDING_A = "11111111-1111-4111-8111-111111111111";
const repo = vi.mocked(usuarioRepository);

function actor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "actor-1",
    nombre: "Actor",
    correo: "actor@test.local",
    rol: "ADMINISTRADOR_HOLDING",
    sessionScope: "holding",
    empresaId: null,
    holdingId: HOLDING_A,
    ...overrides,
  };
}

const newUser = (rol: "SUPER_ADMIN" | "ADMINISTRADOR_HOLDING" | "SUPERVISOR") => ({
  nombre: "Nuevo",
  correo: "nuevo@test.local",
  password: "clave-123456-larga",
  rol,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findPublicById.mockResolvedValue({ id: "target", rol: "ASESOR" } as never);
});

describe("createUsuario — role ceiling (T5b)", () => {
  it.each(["ADMINISTRADOR_HOLDING", "SUPERVISOR_HOLDING", "ADMINISTRADOR", "SUPERVISOR"] as const)(
    "%s cannot create a SUPER_ADMIN",
    async (rol) => {
      await expect(createUsuario(actor({ rol }), newUser("SUPER_ADMIN"))).rejects.toMatchObject({
        code: "permiso_denegado",
        statusHttp: 403,
      });
      expect(repo.createUsuario).not.toHaveBeenCalled();
    },
  );

  it("a SUPER_ADMIN can create a SUPER_ADMIN", async () => {
    await createUsuario(actor({ rol: "SUPER_ADMIN", holdingId: null }), newUser("SUPER_ADMIN"));
    expect(repo.createUsuario).toHaveBeenCalledWith(expect.objectContaining({ rol: "SUPER_ADMIN" }), expect.anything());
  });

  it.each(["SUPERVISOR_HOLDING", "ADMINISTRADOR", "SUPERVISOR"] as const)(
    "%s cannot create an ADMINISTRADOR_HOLDING",
    async (rol) => {
      await expect(createUsuario(actor({ rol }), newUser("ADMINISTRADOR_HOLDING"))).rejects.toMatchObject({
        code: "permiso_denegado",
      });
      expect(repo.createUsuario).not.toHaveBeenCalled();
    },
  );

  it("an ADMINISTRADOR_HOLDING can create an ADMINISTRADOR_HOLDING of its own holding", async () => {
    await createUsuario(actor(), newUser("ADMINISTRADOR_HOLDING"));
    expect(repo.createUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ rol: "ADMINISTRADOR_HOLDING", holdingId: HOLDING_A }),
      expect.anything(),
    );
  });
});

describe("updateUsuario — role ceiling and holdingId (T5b)", () => {
  it("a holding admin cannot promote a user to SUPER_ADMIN", async () => {
    await expect(updateUsuario(actor(), "target", { rol: "SUPER_ADMIN" })).rejects.toMatchObject({
      code: "permiso_denegado",
      statusHttp: 403,
    });
    expect(repo.updateUsuario).not.toHaveBeenCalled();
  });

  it("a SUPER_ADMIN can promote a user to SUPER_ADMIN", async () => {
    await updateUsuario(actor({ rol: "SUPER_ADMIN", holdingId: null }), "target", { rol: "SUPER_ADMIN" });
    expect(repo.updateUsuario).toHaveBeenCalledWith("target", expect.objectContaining({ rol: "SUPER_ADMIN" }));
  });

  it("a holding admin cannot edit a user that is already a SUPER_ADMIN", async () => {
    repo.findPublicById.mockResolvedValue({ id: "target", rol: "SUPER_ADMIN" } as never);
    await expect(updateUsuario(actor(), "target", { nombre: "x" })).rejects.toMatchObject({ code: "permiso_denegado" });
    expect(repo.updateUsuario).not.toHaveBeenCalled();
  });

  it("a legacy ADMINISTRADOR cannot edit an ADMINISTRADOR_HOLDING", async () => {
    repo.findPublicById.mockResolvedValue({ id: "target", rol: "ADMINISTRADOR_HOLDING" } as never);
    await expect(updateUsuario(actor({ rol: "ADMINISTRADOR" }), "target", { activo: false })).rejects.toMatchObject({
      code: "permiso_denegado",
    });
  });

  it("never forwards a holdingId smuggled in the body", async () => {
    await updateUsuario(actor(), "target", { nombre: "x", holdingId: "99999999-9999-4999-8999-999999999999" } as never);
    const data = repo.updateUsuario.mock.calls[0]![1] as unknown as Record<string, unknown>;
    expect(data).not.toHaveProperty("holdingId");
  });
});
