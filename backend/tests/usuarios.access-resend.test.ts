import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * crm-user-access-resend (F2): POST /usuarios/:id/reenviar-acceso.
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
vi.mock("../src/repositories/membresia.repository.js", () => ({ findActivasByUsuarioId: vi.fn() }));
vi.mock("../src/repositories/usuario.repository.js", () => ({
  DOMINIO_CORREO_PORTADOR: "no-login.crm.local",
  findById: vi.fn(),
  existsEnEmpresa: vi.fn(),
  existsEnHolding: vi.fn(),
}));
vi.mock("../src/messaging/outbox.js", () => ({
  CRM_USER_CREATED_EVENT: "CrmUserCreated",
  CRM_USER_EMAIL_CHANGED_EVENT: "CrmUserEmailChanged",
  CRM_USER_ACCESS_RESEND_REQUESTED_EVENT: "CrmUserAccessResendRequested",
  enqueueOutboxEvent: vi.fn(async () => ({ id: "o-1" })),
  findRecentOutboxEvent: vi.fn(),
}));
vi.mock("../src/messaging/crm-user-created.js", () => ({ enqueueCrmUserCreated: vi.fn() }));
vi.mock("../src/services/asignacion.service.js", () => ({}));
vi.mock("../src/services/committed-events.service.js", () => ({ publishCommittedEvents: vi.fn() }));
vi.mock("../src/lib/metricas-broadcast.js", () => ({ scheduleMetricasBroadcast: vi.fn() }));
vi.mock("../src/services/presencia.service.js", () => ({ getPresenceForUsuarios: vi.fn(() => new Map()) }));
vi.mock("../src/services/shadow-authorization.service.js", () => ({ compareRequireRole: vi.fn() }));

import type { NextFunction, Request, Response } from "express";
import { postReenviarAccesoUsuario } from "../src/controllers/usuarios.controller.js";
import { AppError } from "../src/lib/app-error.js";
import { enqueueOutboxEvent, findRecentOutboxEvent } from "../src/messaging/outbox.js";
import { requireRole } from "../src/middlewares/require-role.middleware.js";
import * as empresaRepository from "../src/repositories/empresa.repository.js";
import * as membresiaRepository from "../src/repositories/membresia.repository.js";
import * as usuarioRepository from "../src/repositories/usuario.repository.js";
import { usuariosRouter } from "../src/routes/usuarios.routes.js";
import { requestUsuarioAccessResend } from "../src/services/usuarios.service.js";
import type { AuthenticatedUser } from "../src/types/authenticated-user.js";

const EMPRESA_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const AUTH_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTH_COMPANY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_ID = "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0";
const HOLDING_ID = "hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh";

const findById = vi.mocked(usuarioRepository.findById);
const existsEnEmpresa = vi.mocked(usuarioRepository.existsEnEmpresa);
const existsEnHolding = vi.mocked(usuarioRepository.existsEnHolding);
const findActivas = vi.mocked(membresiaRepository.findActivasByUsuarioId);
const findEmpresa = vi.mocked(empresaRepository.findById);
const findRecent = vi.mocked(findRecentOutboxEvent);
const enqueueRaw = vi.mocked(enqueueOutboxEvent);

const actor: AuthenticatedUser = {
  id: "actor-1",
  nombre: "Actor",
  correo: "actor@test.local",
  rol: "ADMINISTRADOR",
  sessionScope: "holding",
  empresaId: null,
  holdingId: HOLDING_ID,
};

function usuario(overrides: Record<string, unknown> = {}) {
  return { id: USER_ID, rol: "VENDEDOR", correo: "Vend@Acme.com ", authUserId: AUTH_USER_ID, ...overrides } as never;
}

async function expectAppError(promise: Promise<unknown>, statusHttp: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusHttp, code });
}

beforeEach(() => {
  vi.clearAllMocks();
  enqueueRaw.mockResolvedValue({ id: "o-1" });
  findRecent.mockResolvedValue(null);
  existsEnHolding.mockResolvedValue(true);
  existsEnEmpresa.mockResolvedValue(true);
  findEmpresa.mockResolvedValue({ id: EMPRESA_ID, authCompanyId: AUTH_COMPANY_ID } as never);
  findActivas.mockResolvedValue([{ id: "m-1", empresaId: EMPRESA_ID, correo: null }] as never);
  findById.mockResolvedValue(usuario());
});

describe("requestUsuarioAccessResend", () => {
  it("linked VENDEDOR: enqueues with Usuario.correo (trimmed + lowercased) in the transaction", async () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    await requestUsuarioAccessResend(actor, USER_ID, now);

    expect(findRecent).toHaveBeenCalledWith(
      TX,
      "CrmUserAccessResendRequested",
      USER_ID,
      new Date("2026-09-21T11:55:00.000Z"),
    );
    expect(enqueueRaw).toHaveBeenCalledTimes(1);
    const [tx, event] = enqueueRaw.mock.calls[0];
    expect(tx).toBe(TX);
    expect(event).toMatchObject({ eventType: "CrmUserAccessResendRequested", aggregateId: USER_ID });
    expect(event.payload).toMatchObject({
      crmUserId: USER_ID,
      authUserId: AUTH_USER_ID,
      authCompanyId: AUTH_COMPANY_ID,
      email: "vend@acme.com",
      occurredAt: now.toISOString(),
    });
    expect(event.payload.correlationId).toBe(event.correlationId);
    expect(event.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("linked portador: the email comes from the active membership", async () => {
    findById.mockResolvedValue(usuario({ rol: "ADMINISTRADOR", correo: "portador-x@no-login.crm.local" }));
    findActivas.mockResolvedValue([{ id: "m-1", empresaId: EMPRESA_ID, correo: "Admin@Acme.com" }] as never);

    await requestUsuarioAccessResend(actor, USER_ID);

    expect(enqueueRaw.mock.calls[0][1].payload).toMatchObject({ email: "admin@acme.com" });
  });

  it("cooldown: 429 and nothing enqueued", async () => {
    findRecent.mockResolvedValue({ id: "o-0", createdAt: new Date() });
    await expectAppError(requestUsuarioAccessResend(actor, USER_ID), 429, "reenvio_en_cooldown");
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("unlinked user: 409 usuario_sin_vinculo_auth", async () => {
    findById.mockResolvedValue(usuario({ authUserId: null }));
    await expectAppError(requestUsuarioAccessResend(actor, USER_ID), 409, "usuario_sin_vinculo_auth");
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("empresa without authCompanyId: 409 empresa_sin_vinculo_auth", async () => {
    findEmpresa.mockResolvedValue({ id: EMPRESA_ID, authCompanyId: null } as never);
    await expectAppError(requestUsuarioAccessResend(actor, USER_ID), 409, "empresa_sin_vinculo_auth");
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("holding-wide role: 409 usuario_no_sincronizable", async () => {
    findById.mockResolvedValue(usuario({ rol: "SUPERVISOR_HOLDING" }));
    await expectAppError(requestUsuarioAccessResend(actor, USER_ID), 409, "usuario_no_sincronizable");
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("user without active memberships: 409 usuario_no_sincronizable", async () => {
    findActivas.mockResolvedValue([]);
    await expectAppError(requestUsuarioAccessResend(actor, USER_ID), 409, "usuario_no_sincronizable");
  });

  it("holding admin out of scope: 404", async () => {
    existsEnHolding.mockResolvedValue(false);
    await expectAppError(requestUsuarioAccessResend(actor, USER_ID), 404, "usuario_no_encontrado");
    expect(enqueueRaw).not.toHaveBeenCalled();
  });

  it("company admin out of scope: 404", async () => {
    existsEnEmpresa.mockResolvedValue(false);
    const companyActor = { ...actor, empresaId: EMPRESA_ID, sessionScope: "empresa" } as unknown as AuthenticatedUser;
    await expectAppError(requestUsuarioAccessResend(companyActor, USER_ID), 404, "usuario_no_encontrado");
    expect(enqueueRaw).not.toHaveBeenCalled();
  });
});

describe("POST /usuarios/:id/reenviar-acceso", () => {
  it("responds 202 { estado } and never includes the email", async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = { user: actor, params: { id: USER_ID } } as unknown as Request;

    await postReenviarAccesoUsuario(req, { status } as unknown as Response);

    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith({ estado: "solicitado" });
    expect(JSON.stringify(json.mock.calls)).not.toContain("acme.com");
  });

  it("rejects an invalid id with 400", async () => {
    const req = { user: actor, params: { id: "nope" } } as unknown as Request;
    await expectAppError(postReenviarAccesoUsuario(req, {} as Response), 400, "validacion_invalida");
  });

  it("is registered as POST behind authentication + requireRole", () => {
    const layer = (usuariosRouter as unknown as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: unknown[] } }[] })
      .stack.find((l) => l.route?.path === "/usuarios/:id/reenviar-acceso");
    expect(layer?.route?.methods.post).toBe(true);
    expect(layer?.route?.stack).toHaveLength(3);
  });

  it("a non-admin role (VENDEDOR) is rejected with 403 by requireRole", () => {
    const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    requireRole("ADMINISTRADOR")({ user: { ...actor, id: "u", rol: "VENDEDOR" } } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusHttp: 403, code: "permiso_denegado" }));
  });
});
