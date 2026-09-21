import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/lib/app-error.js";

const tx = { marker: "tx" };
const usuarioRepository = { findById: vi.fn(), replaceCorreoIfEquals: vi.fn() };
const membresiaRepository = {
  findActivasByUsuarioId: vi.fn(),
  replaceCorreoIfEquals: vi.fn(),
  assertCorreoDisponible: vi.fn(),
};
const empresaRepository = { findById: vi.fn() };
const findOutboxEventByCorrelation = vi.fn();
const enqueueOutboxEvent = vi.fn();
const runAsSystem = vi.fn(<T>(fn: () => T) => fn());

vi.mock("../src/lib/prisma.js", () => ({
  AUTH_PROVISIONING_TRANSACTION_BOUNDS: { maxWait: 1, timeout: 1 },
  runAsSystem: (fn: () => unknown) => runAsSystem(fn),
  runInTransaction: (_tx: unknown, fn: (t: unknown) => unknown) => fn(tx),
}));
vi.mock("../src/repositories/usuario.repository.js", () => usuarioRepository);
vi.mock("../src/repositories/membresia.repository.js", () => membresiaRepository);
vi.mock("../src/repositories/empresa.repository.js", () => empresaRepository);
vi.mock("../src/messaging/outbox.js", () => ({
  CRM_USER_EMAIL_CHANGED_EVENT: "CrmUserEmailChanged",
  findOutboxEventByCorrelation,
  enqueueOutboxEvent,
}));

const { revertUserEmailChange } = await import("../src/services/email-sync.service.js");

const input = {
  crmUserId: randomUUID(),
  authUserId: randomUUID(),
  authCompanyId: randomUUID(),
  correlationId: randomUUID(),
};

beforeEach(() => {
  vi.clearAllMocks();
  findOutboxEventByCorrelation.mockResolvedValue({
    id: "outbox-1",
    payload: { oldEmail: "old@acme.test", newEmail: "new@acme.test" },
  });
  usuarioRepository.findById.mockResolvedValue({
    id: input.crmUserId,
    authUserId: input.authUserId,
    rol: "VENDEDOR",
    correo: "New@Acme.test",
  });
  membresiaRepository.findActivasByUsuarioId.mockResolvedValue([{ id: "m-1", empresaId: "empresa-1", correo: null }]);
  membresiaRepository.assertCorreoDisponible.mockResolvedValue(undefined);
  membresiaRepository.replaceCorreoIfEquals.mockResolvedValue(true);
  usuarioRepository.replaceCorreoIfEquals.mockResolvedValue(true);
  empresaRepository.findById.mockResolvedValue({ id: "empresa-1", authCompanyId: input.authCompanyId });
});

function expectNoWrite() {
  expect(usuarioRepository.replaceCorreoIfEquals).not.toHaveBeenCalled();
  expect(membresiaRepository.replaceCorreoIfEquals).not.toHaveBeenCalled();
  expect(enqueueOutboxEvent).not.toHaveBeenCalled();
}

describe("revertUserEmailChange", () => {
  it("reverts Usuario.correo (compare-and-set), as system, without enqueueing any event", async () => {
    await expect(revertUserEmailChange(input)).resolves.toBe("reverted");

    expect(runAsSystem).toHaveBeenCalledTimes(1);
    expect(findOutboxEventByCorrelation).toHaveBeenCalledWith(tx, {
      eventType: "CrmUserEmailChanged",
      aggregateId: input.crmUserId,
      correlationId: input.correlationId,
    });
    expect(usuarioRepository.replaceCorreoIfEquals).toHaveBeenCalledWith(
      input.crmUserId,
      "New@Acme.test",
      "old@acme.test",
      tx,
    );
    expect(membresiaRepository.replaceCorreoIfEquals).not.toHaveBeenCalled();
    expect(enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("reverts the membership email of a portador user and leaves Usuario.correo alone", async () => {
    usuarioRepository.findById.mockResolvedValue({
      id: input.crmUserId,
      authUserId: input.authUserId,
      rol: "ADMINISTRADOR",
      correo: "synthetic@crm.invalid",
    });
    membresiaRepository.findActivasByUsuarioId.mockResolvedValue([
      { id: "m-1", empresaId: "empresa-1", correo: " NEW@acme.test " },
    ]);

    await expect(revertUserEmailChange(input)).resolves.toBe("reverted");

    expect(membresiaRepository.replaceCorreoIfEquals).toHaveBeenCalledWith("m-1", " NEW@acme.test ", "old@acme.test", tx);
    expect(usuarioRepository.replaceCorreoIfEquals).not.toHaveBeenCalled();
    expect(enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("does not revert when the outbox row of the original event is missing", async () => {
    findOutboxEventByCorrelation.mockResolvedValue(null);

    await expect(revertUserEmailChange(input)).resolves.toBe("outbox_row_missing");
    expectNoWrite();
  });

  it("does not revert when the outbox payload lacks the emails", async () => {
    findOutboxEventByCorrelation.mockResolvedValue({ id: "o", payload: { oldEmail: "old@acme.test" } });

    await expect(revertUserEmailChange(input)).resolves.toBe("outbox_payload_invalid");
    expectNoWrite();
  });

  it("does not revert when the current email is no longer the event's newEmail", async () => {
    usuarioRepository.findById.mockResolvedValue({
      id: input.crmUserId,
      authUserId: input.authUserId,
      rol: "VENDEDOR",
      correo: "third@acme.test",
    });

    await expect(revertUserEmailChange(input)).resolves.toBe("email_changed_again");
    expectNoWrite();
  });

  it("reports email_changed_again when the compare-and-set loses a race", async () => {
    usuarioRepository.replaceCorreoIfEquals.mockResolvedValue(false);

    await expect(revertUserEmailChange(input)).resolves.toBe("email_changed_again");
    expect(enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("does not revert on an authUserId mismatch", async () => {
    usuarioRepository.findById.mockResolvedValue({
      id: input.crmUserId,
      authUserId: randomUUID(),
      rol: "VENDEDOR",
      correo: "new@acme.test",
    });

    await expect(revertUserEmailChange(input)).resolves.toBe("auth_user_mismatch");
    expectNoWrite();
  });

  it("does not revert on an empresa authCompanyId mismatch", async () => {
    empresaRepository.findById.mockResolvedValue({ id: "empresa-1", authCompanyId: randomUUID() });

    await expect(revertUserEmailChange(input)).resolves.toBe("company_mismatch");
    expectNoWrite();
  });

  it("reports user_not_found and not_syncable (holding-wide / no membership) without writing", async () => {
    usuarioRepository.findById.mockResolvedValueOnce(null);
    await expect(revertUserEmailChange(input)).resolves.toBe("user_not_found");

    usuarioRepository.findById.mockResolvedValueOnce({
      id: input.crmUserId,
      authUserId: input.authUserId,
      rol: "SUPER_ADMIN",
      correo: "new@acme.test",
    });
    await expect(revertUserEmailChange(input)).resolves.toBe("not_syncable");

    membresiaRepository.findActivasByUsuarioId.mockResolvedValueOnce([]);
    await expect(revertUserEmailChange(input)).resolves.toBe("not_syncable");
    expectNoWrite();
  });

  it("reports email_in_use when the old email was taken meanwhile (cross-table guard or unique violation)", async () => {
    membresiaRepository.assertCorreoDisponible.mockRejectedValueOnce(
      new AppError("correo_no_disponible", 409, "El correo ya está en uso"),
    );
    await expect(revertUserEmailChange(input)).resolves.toBe("email_in_use");

    usuarioRepository.replaceCorreoIfEquals.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(revertUserEmailChange(input)).resolves.toBe("email_in_use");
    expect(enqueueOutboxEvent).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors so the message is abandoned", async () => {
    findOutboxEventByCorrelation.mockRejectedValue(new Error("db down"));

    await expect(revertUserEmailChange(input)).rejects.toThrow("db down");
  });
});
