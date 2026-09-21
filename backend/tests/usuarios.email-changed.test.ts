import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * crm-user-email-sync (E1): `updateUsuario` (PATCH /usuarios/:id) with `correo`.
 * Non-DB: repositories, the transaction helper and the outbox are mocked.
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
  findActivasByUsuarioId: vi.fn(),
  assertCorreoDisponible: vi.fn(),
  updateCorreo: vi.fn(),
}));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  DOMINIO_CORREO_PORTADOR: "no-login.crm.local",
  findById: vi.fn(),
  findPublicById: vi.fn(),
  existsEnEmpresa: vi.fn(),
  existsEnHolding: vi.fn(),
  updateUsuario: vi.fn(),
}));
vi.mock("../src/messaging/outbox.js", () => ({
  CRM_USER_CREATED_EVENT: "CrmUserCreated",
  CRM_USER_EMAIL_CHANGED_EVENT: "CrmUserEmailChanged",
  enqueueOutboxEvent: vi.fn(async () => ({ id: "o-1" })),
}));
vi.mock("../src/messaging/crm-user-created.js", () => ({ enqueueCrmUserCreated: vi.fn() }));
vi.mock("../src/services/asignacion.service.js", () => ({}));
vi.mock("../src/services/committed-events.service.js", () => ({ publishCommittedEvents: vi.fn() }));
vi.mock("../src/lib/metricas-broadcast.js", () => ({ scheduleMetricasBroadcast: vi.fn() }));
vi.mock("../src/services/presencia.service.js", () => ({ getPresenceForUsuarios: vi.fn(() => new Map()) }));

import { runInTransaction } from "../src/lib/prisma.js";
import { enqueueCrmUserEmailChanged } from "../src/messaging/crm-user-email-changed.js";
import { enqueueOutboxEvent } from "../src/messaging/outbox.js";
import * as empresaRepository from "../src/repositories/empresa.repository.js";
import * as membresiaRepository from "../src/repositories/membresia.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import { updateUsuario } from "../src/services/usuarios.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";
import { AppError } from "../src/lib/app-error.js";

const EMPRESA_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const AUTH_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTH_COMPANY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_ID = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";

const findById = vi.mocked(usuarioRepository.findById);
const findPublicById = vi.mocked(usuarioRepository.findPublicById);
const updateRow = vi.mocked(usuarioRepository.updateUsuario);
const findActivas = vi.mocked(membresiaRepository.findActivasByUsuarioId);
const assertDisponible = vi.mocked(membresiaRepository.assertCorreoDisponible);
const updateCorreo = vi.mocked(membresiaRepository.updateCorreo);
const findEmpresa = vi.mocked(empresaRepository.findById);
const enqueueRaw = vi.mocked(enqueueOutboxEvent);

const actor: AuthenticatedUser = {
  id: "actor-1",
  nombre: "Actor",
  correo: "actor@test.local",
  rol: "SUPER_ADMIN",
  sessionScope: "holding",
  empresaId: null,
  holdingId: null,
};

function usuario(overrides: Record<string, unknown> = {}) {
  return { id: USER_ID, rol: "VENDEDOR", correo: "old@acme.com", authUserId: AUTH_USER_ID, ...overrides } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  assertDisponible.mockReset();
  enqueueRaw.mockReset();
  enqueueRaw.mockResolvedValue({ id: "o-1" });
  findPublicById.mockResolvedValue({ id: USER_ID, rol: "VENDEDOR" } as never);
  updateRow.mockImplementation((async (_id: string, data: Record<string, unknown>) => ({
    id: USER_ID,
    ...data,
  })) as never);
  findEmpresa.mockResolvedValue({ id: EMPRESA_ID, authCompanyId: AUTH_COMPANY_ID } as never);
  findActivas.mockResolvedValue([{ id: "m-1", empresaId: EMPRESA_ID, correo: null }] as never);
  findById.mockResolvedValue(usuario());
});

describe("updateUsuario correo: linked portador (email in Membresia.correo)", () => {
  beforeEach(() => {
    findById.mockResolvedValue(usuario({ rol: "ADMINISTRADOR", correo: "portador-admin-x@no-login.crm.local" }));
    findActivas.mockResolvedValue([{ id: "m-1", empresaId: EMPRESA_ID, correo: "Old@Acme.com" }] as never);
  });

  it("writes Membresia.correo, leaves Usuario.correo untouched and enqueues the event", async () => {
    await updateUsuario(actor, USER_ID, { correo: "New@Acme.com", nombre: "Nuevo" });

    expect(assertDisponible).toHaveBeenCalledWith("New@Acme.com", TX);
    expect(updateCorreo).toHaveBeenCalledWith("m-1", "New@Acme.com", TX);
    expect(updateRow).toHaveBeenCalledTimes(1);
    const [, data, client] = updateRow.mock.calls[0];
    expect(data.correo).toBeUndefined();
    expect(data.nombre).toBe("Nuevo");
    expect(client).toBe(TX);
    expect(enqueueRaw).toHaveBeenCalledTimes(1);
    const [tx, event] = enqueueRaw.mock.calls[0];
    expect(tx).toBe(TX);
    expect(event).toMatchObject({ eventType: "CrmUserEmailChanged", aggregateId: USER_ID });
    expect(event.payload).toMatchObject({
      crmUserId: USER_ID,
      authUserId: AUTH_USER_ID,
      authCompanyId: AUTH_COMPANY_ID,
      oldEmail: "old@acme.com",
      newEmail: "new@acme.com",
    });
  });

  it("case-only change: no email write, no event, other fields still saved", async () => {
    await updateUsuario(actor, USER_ID, { correo: "OLD@acme.com", nombre: "Nuevo" });

    expect(assertDisponible).not.toHaveBeenCalled();
    expect(updateCorreo).not.toHaveBeenCalled();
    expect(enqueueRaw).not.toHaveBeenCalled();
    expect(updateRow.mock.calls[0][1]).toMatchObject({ nombre: "Nuevo", correo: undefined });
  });

  it("collision in Membresia/Usuario.correo: conflict, nothing written, no event", async () => {
    assertDisponible.mockRejectedValue(new AppError("correo_no_disponible", 409, "El correo ya está en uso"));
    await expect(updateUsuario(actor, USER_ID, { correo: "taken@acme.com" })).rejects.toMatchObject({
      statusHttp: 409,
    });
    expect(updateCorreo).not.toHaveBeenCalled();
    expect(updateRow).not.toHaveBeenCalled();
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("unlinked (authUserId null): 409 usuario_sin_vinculo_auth and nothing written", async () => {
    findById.mockResolvedValue(usuario({ rol: "ADMINISTRADOR", authUserId: null }));
    await expect(updateUsuario(actor, USER_ID, { correo: "new@acme.com" })).rejects.toMatchObject({
      statusHttp: 409,
      code: "usuario_sin_vinculo_auth",
    });
    expect(updateCorreo).not.toHaveBeenCalled();
    expect(updateRow).not.toHaveBeenCalled();
    expect(enqueueRaw).not.toHaveBeenCalled();
  });
});

describe("updateUsuario correo: linked VENDEDOR (email in Usuario.correo)", () => {
  it("writes Usuario.correo and enqueues the event", async () => {
    await updateUsuario(actor, USER_ID, { correo: "New@Acme.com" });

    expect(updateCorreo).not.toHaveBeenCalled();
    expect(updateRow.mock.calls[0][1]).toMatchObject({ correo: "New@Acme.com" });
    expect(enqueueRaw.mock.calls[0][1].payload).toMatchObject({ oldEmail: "old@acme.com", newEmail: "new@acme.com" });
  });

  it("case-only change: no write of the email, no event", async () => {
    await updateUsuario(actor, USER_ID, { correo: "OLD@ACME.COM" });
    expect(updateRow.mock.calls[0][1].correo).toBeUndefined();
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("empresa without authCompanyId: 409 empresa_sin_vinculo_auth", async () => {
    findEmpresa.mockResolvedValue({ id: EMPRESA_ID, authCompanyId: null } as never);
    await expect(updateUsuario(actor, USER_ID, { correo: "new@acme.com" })).rejects.toMatchObject({
      statusHttp: 409,
      code: "empresa_sin_vinculo_auth",
    });
    expect(updateRow).not.toHaveBeenCalled();
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("collision: conflict and no event", async () => {
    assertDisponible.mockRejectedValue(new AppError("correo_no_disponible", 409, "El correo ya está en uso"));
    await expect(updateUsuario(actor, USER_ID, { correo: "taken@acme.com" })).rejects.toMatchObject({
      statusHttp: 409,
    });
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("unique violation on write (P2002) maps to correo_en_uso, no event", async () => {
    updateRow.mockRejectedValue({ code: "P2002" });
    await expect(updateUsuario(actor, USER_ID, { correo: "new@acme.com" })).rejects.toMatchObject({
      code: "correo_en_uso",
    });
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("rollback path: a failing enqueue rejects the whole update", async () => {
    enqueueRaw.mockRejectedValueOnce(new Error("outbox down"));
    await expect(updateUsuario(actor, USER_ID, { correo: "new@acme.com" })).rejects.toThrow("outbox down");
    expect(vi.mocked(runInTransaction)).toHaveBeenCalledTimes(1);
  });
});

describe("updateUsuario correo: holding-wide and other paths", () => {
  it.each(["ADMINISTRADOR_HOLDING", "SUPERVISOR_HOLDING", "SUPER_ADMIN"])(
    "%s: legacy write of Usuario.correo, no event",
    async (rol) => {
      findById.mockResolvedValue(usuario({ rol, authUserId: null }));
      await updateUsuario(actor, USER_ID, { correo: "new@acme.com" });
      expect(updateRow.mock.calls[0][1]).toMatchObject({ correo: "new@acme.com" });
      expect(enqueueRaw).not.toHaveBeenCalled();
    },
  );

  it("legacy ADMINISTRADOR without membership: legacy write, no event", async () => {
    findById.mockResolvedValue(usuario({ rol: "ADMINISTRADOR", authUserId: null }));
    findActivas.mockResolvedValue([]);
    await updateUsuario(actor, USER_ID, { correo: "new@acme.com" });
    expect(updateRow.mock.calls[0][1]).toMatchObject({ correo: "new@acme.com" });
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("PATCH without correo: previous path, no transaction, no event", async () => {
    await updateUsuario(actor, USER_ID, { nombre: "Solo nombre" });
    expect(vi.mocked(runInTransaction)).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
    expect(updateRow).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ nombre: "Solo nombre" }));
    expect(enqueueRaw).not.toHaveBeenCalled();
  });
});

describe("enqueueCrmUserEmailChanged", () => {
  it("writes the contract payload through the caller's transaction", async () => {
    await enqueueCrmUserEmailChanged(TX as never, {
      crmUserId: USER_ID,
      authUserId: AUTH_USER_ID,
      authCompanyId: AUTH_COMPANY_ID,
      oldEmail: "  Old@Acme.com ",
      newEmail: "NEW@acme.com",
      now: new Date("2026-01-02T03:04:05.000Z"),
    });
    const [tx, input] = enqueueRaw.mock.calls[0];
    expect(tx).toBe(TX);
    expect(input.eventType).toBe("CrmUserEmailChanged");
    expect(input.aggregateId).toBe(USER_ID);
    expect(input.payload).toEqual({
      crmUserId: USER_ID,
      authUserId: AUTH_USER_ID,
      authCompanyId: AUTH_COMPANY_ID,
      oldEmail: "old@acme.com",
      newEmail: "new@acme.com",
      correlationId: input.correlationId,
      occurredAt: "2026-01-02T03:04:05.000Z",
    });
    expect(input.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
