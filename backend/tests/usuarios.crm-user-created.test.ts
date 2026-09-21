import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * crm-user-auth-provisioning (C1): which create paths enqueue `CrmUserCreated`
 * and with which login email. Non-DB: repositories and the enqueue helper are
 * mocked; the helper itself is covered in `crm-user-created.test.ts`.
 */
const TX = { tag: "tx" };
vi.mock("../src/lib/prisma.js", () => ({
  runInTransaction: vi.fn(async (_c: unknown, fn: (tx: unknown) => unknown) => fn(TX)),
  USUARIOS_TRANSACTION_BOUNDS: {},
}));
vi.mock("../src/lib/password.js", () => ({ hashPassword: vi.fn(async () => "hash") }));
vi.mock("../src/repositories/empresa.repository.js", () => ({ findById: vi.fn() }));
vi.mock("../src/repositories/holding.repository.js", () => ({ findById: vi.fn() }));
vi.mock("../src/repositories/lead.repository.js", () => ({}));
vi.mock("../src/repositories/membresia.repository.js", () => ({
  assertCorreoDisponible: vi.fn(),
  createMembresia: vi.fn(),
  createMembresiaConCredencial: vi.fn(async (data: Record<string, unknown>) => ({ id: "m-1", activa: true, ...data })),
}));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  DOMINIO_CORREO_PORTADOR: "no-login.crm.local",
  createUsuario: vi.fn(async (data: object) => ({ id: "new-user", activo: true, ...data })),
}));
vi.mock("../src/messaging/crm-user-created.js", () => ({ enqueueCrmUserCreated: vi.fn() }));
vi.mock("../src/services/asignacion.service.js", () => ({}));
vi.mock("../src/services/committed-events.service.js", () => ({ publishCommittedEvents: vi.fn() }));
vi.mock("../src/lib/metricas-broadcast.js", () => ({ scheduleMetricasBroadcast: vi.fn() }));
vi.mock("../src/services/presencia.service.js", () => ({ getPresenceForUsuarios: vi.fn(() => new Map()) }));

import { enqueueCrmUserCreated } from "../src/messaging/crm-user-created.js";
import * as empresaRepository from "../src/repositories/empresa.repository.js";
import {
  createEmpresaAdministrador,
  createEmpresaAsesor,
  createEmpresaSupervisor,
  createUsuario,
} from "../src/services/usuarios.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";

const EMPRESA_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const HOLDING_ID = "11111111-1111-4111-8111-111111111111";
const enqueue = vi.mocked(enqueueCrmUserCreated);
const findEmpresa = vi.mocked(empresaRepository.findById);
const EMPRESA = { id: EMPRESA_ID, holdingId: HOLDING_ID, authCompanyId: "auth-company-1" };

function holdingActor(): AuthenticatedUser {
  return {
    id: "actor-1",
    nombre: "Actor",
    correo: "actor@test.local",
    rol: "ADMINISTRADOR_HOLDING",
    sessionScope: "holding",
    empresaId: null,
    holdingId: HOLDING_ID,
  };
}

function companyActor(): AuthenticatedUser {
  return { ...holdingActor(), rol: "ADMINISTRADOR", sessionScope: "empresa", empresaId: EMPRESA_ID, holdingId: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  findEmpresa.mockResolvedValue(EMPRESA as never);
});

describe("createUsuario", () => {
  const input = (rol: "ASESOR" | "VENDEDOR") => ({
    nombre: "Ana",
    correo: "ana@acme.com",
    password: "clave-123456-larga",
    rol,
    empresaId: EMPRESA_ID,
  });

  it.each(["ASESOR", "VENDEDOR"] as const)("enqueues for %s with Usuario.correo as the login email", async (rol) => {
    await createUsuario(holdingActor(), input(rol));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(TX, {
      crmUserId: "new-user",
      loginEmail: "ana@acme.com",
      fullName: "Ana",
      crmRole: rol,
      empresa: EMPRESA,
    });
  });

  it("loads the empresa itself for a company-scoped actor", async () => {
    await createUsuario(companyActor(), input("ASESOR"));

    expect(findEmpresa).toHaveBeenCalledWith(EMPRESA_ID, TX);
    expect(enqueue).toHaveBeenCalledWith(TX, expect.objectContaining({ empresa: EMPRESA }));
  });

  it.each(["ADMINISTRADOR", "SUPERVISOR", "ADMINISTRADOR_HOLDING", "SUPERVISOR_HOLDING"] as const)(
    "never enqueues for the holding-wide/legacy role %s (no empresa placement)",
    async (rol) => {
      await createUsuario(holdingActor(), { nombre: "X", correo: "x@acme.com", password: "clave-123456-larga", rol });
      expect(enqueue).not.toHaveBeenCalled();
    },
  );
});

describe("createEmpresaAdministrador|Supervisor|Asesor", () => {
  const input = { nombre: "Luis Gomez", correo: "luis@acme.com", password: "clave-123456-larga" };
  const scope = { holdingId: HOLDING_ID } as never;

  it.each([
    ["ADMINISTRADOR", createEmpresaAdministrador],
    ["SUPERVISOR", createEmpresaSupervisor],
    ["ASESOR", createEmpresaAsesor],
  ] as const)("%s: enqueues with Membresia.correo, never the synthetic portador email", async (crmRole, create) => {
    await create(EMPRESA_ID, input, scope);

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [tx, event] = enqueue.mock.calls[0];
    expect(tx).toBe(TX);
    expect(event).toEqual({
      crmUserId: "new-user",
      loginEmail: "luis@acme.com",
      fullName: "Luis Gomez",
      crmRole,
      empresa: EMPRESA,
    });
    expect(event.loginEmail).not.toContain("no-login.crm.local");
  });

  it("does not enqueue when the empresa is outside the actor's scope (404, nothing written)", async () => {
    findEmpresa.mockResolvedValue({ ...EMPRESA, holdingId: "22222222-2222-4222-8222-222222222222" } as never);
    await expect(createEmpresaAsesor(EMPRESA_ID, input, scope)).rejects.toMatchObject({ statusHttp: 404 });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
