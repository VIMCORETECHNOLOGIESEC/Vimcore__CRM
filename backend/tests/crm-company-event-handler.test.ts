import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCompanyEventHandler,
  decideCompanyEvent,
  type CrmCompanyEventHandlerDeps,
  type CrmCompanyEventMessage,
} from "../src/messaging/crm-company-event-handler.js";
import {
  AuthProvisioningConflictError,
  type ProvisionCrmCompanyResult,
} from "../src/services/auth-provisioning.service.js";

/**
 * holding-admin-gateway-auth (T5b): settlement decisions of the CRM consumer,
 * with fake messages/receivers and a fake provisioning service (the real one is
 * covered against the database in `auth-provisioning.service.test.ts`).
 */
const RESULT: ProvisionCrmCompanyResult = {
  outcome: "provisioned",
  holdingId: "holding-1",
  empresaId: "empresa-1",
  usuarioId: "usuario-1",
};

const provision = vi.fn();
const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const linkAuthUser = vi.fn();
const deps = { provision, linkAuthUser, log } as unknown as CrmCompanyEventHandlerDeps;

beforeEach(() => {
  vi.clearAllMocks();
  provision.mockResolvedValue(RESULT);
  linkAuthUser.mockResolvedValue("linked");
});

function payload(overrides: Record<string, unknown> = {}) {
  return {
    eventType: "CompanyModuleSubscribed",
    companyId: randomUUID(),
    module: "crm",
    legalName: "Acme SA",
    email: "corp@acme.test",
    occurredAt: "2026-09-18T10:00:00.000Z",
    correlationId: randomUUID(),
    adminUserId: randomUUID(),
    adminEmail: "ada@acme.test",
    adminFullName: "Ada Admin",
    ...overrides,
  };
}

function message(
  body: unknown,
  properties: Record<string, unknown> = {
    eventType: "CompanyModuleSubscribed",
    module: "crm",
    correlationId: "corr-1",
  },
): CrmCompanyEventMessage {
  return {
    messageId: "msg-1",
    correlationId: undefined,
    applicationProperties: properties as CrmCompanyEventMessage["applicationProperties"],
    body: typeof body === "string" || Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)),
  };
}

describe("decideCompanyEvent — CompanyModuleSubscribed for crm", () => {
  it("provisions with the admin fields and completes", async () => {
    const body = payload();

    const decision = await decideCompanyEvent(message(body), deps);

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).toHaveBeenCalledWith({
      companyId: body.companyId,
      legalName: "Acme SA",
      adminUserId: body.adminUserId,
      adminEmail: "ada@acme.test",
      adminFullName: "Ada Admin",
    });
  });

  it("accepts a string body and a body already decoded by the SDK", async () => {
    const body = payload();

    expect(await decideCompanyEvent(message(JSON.stringify(body)), deps)).toEqual({ kind: "complete" });
    const decoded = { ...message(body), body };
    expect(await decideCompanyEvent(decoded, deps)).toEqual({ kind: "complete" });
    expect(provision).toHaveBeenCalledTimes(2);
  });

  it("falls back to the payload when the broker properties are absent", async () => {
    const decision = await decideCompanyEvent(message(payload(), {}), deps);

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).toHaveBeenCalledTimes(1);
  });

  it("completes without provisioning when the admin fields are absent (warns)", async () => {
    const body = payload({ adminUserId: undefined, adminEmail: undefined, adminFullName: undefined });

    const decision = await decideCompanyEvent(message(body), deps);

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("completes without provisioning when only some admin fields are present", async () => {
    const decision = await decideCompanyEvent(message(payload({ adminEmail: undefined })), deps);

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).not.toHaveBeenCalled();
  });

  it.each([
    ["companyId is not a uuid", { companyId: "not-a-uuid" }],
    ["adminUserId is not a uuid", { adminUserId: "nope" }],
    ["adminEmail is not an email", { adminEmail: "not-an-email" }],
    ["legalName is missing", { legalName: undefined }],
    ["companyId has the wrong type", { companyId: 42 }],
  ])("dead-letters when %s", async (_label, overrides) => {
    const decision = await decideCompanyEvent(message(payload(overrides)), deps);

    expect(decision).toMatchObject({ kind: "deadLetter", reason: "InvalidPayload" });
    expect(provision).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a JSON array", "[1,2]"],
    ["a JSON scalar", "42"],
  ])("dead-letters %s", async (_label, body) => {
    const decision = await decideCompanyEvent(message(body), deps);

    expect(decision).toMatchObject({ kind: "deadLetter", reason: "MalformedPayload" });
    expect(provision).not.toHaveBeenCalled();
  });

  it("dead-letters a provisioning conflict with a reason and no email in the description", async () => {
    provision.mockRejectedValue(new AuthProvisioningConflictError("admin_email_conflict", "conflict"));

    const decision = await decideCompanyEvent(message(payload()), deps);

    expect(decision).toEqual({ kind: "deadLetter", reason: "ProvisioningConflict", description: "conflict" });
    const logged = JSON.stringify(log.error.mock.calls);
    expect(logged).toContain("corr-1");
    expect(logged).not.toContain("ada@acme.test");
  });

  it("abandons on an unexpected/transient error so the broker redelivers", async () => {
    provision.mockRejectedValue(new Error("connection refused"));

    const decision = await decideCompanyEvent(message(payload()), deps);

    expect(decision).toEqual({ kind: "abandon" });
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});

describe("decideCompanyEvent — events the CRM does not handle", () => {
  it("completes and ignores another module without parsing the body", async () => {
    const decision = await decideCompanyEvent(
      message("{not json", { eventType: "CompanyModuleSubscribed", module: "billing" }),
      deps,
    );

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).not.toHaveBeenCalled();
  });

  it("completes and ignores another module announced only in the payload", async () => {
    const decision = await decideCompanyEvent(message(payload({ module: "billing" }), {}), deps);

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).not.toHaveBeenCalled();
  });

  it("completes and ignores an unknown eventType", async () => {
    const decision = await decideCompanyEvent(
      message(payload({ eventType: "IssuerUserInviteRequested" }), {
        eventType: "IssuerUserInviteRequested",
        module: "crm",
      }),
      deps,
    );

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).not.toHaveBeenCalled();
  });

  it("logs and completes CompanyModuleUnsubscribed without provisioning", async () => {
    const body = { eventType: "CompanyModuleUnsubscribed", companyId: randomUUID(), module: "crm", status: "inactive" };

    const decision = await decideCompanyEvent(
      message(body, { eventType: "CompanyModuleUnsubscribed", module: "crm", correlationId: "corr-2" }),
      deps,
    );

    expect(decision).toEqual({ kind: "complete" });
    expect(provision).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledTimes(1);
  });
});

describe("createCompanyEventHandler — settlement", () => {
  const settler = {
    completeMessage: vi.fn(),
    deadLetterMessage: vi.fn(),
    abandonMessage: vi.fn(),
  };

  beforeEach(() => {
    settler.completeMessage.mockResolvedValue(undefined);
    settler.deadLetterMessage.mockResolvedValue(undefined);
    settler.abandonMessage.mockResolvedValue(undefined);
  });

  function handler() {
    return createCompanyEventHandler(settler, deps);
  }

  it("completes exactly once on success", async () => {
    const msg = message(payload());

    await handler()(msg as never);

    expect(settler.completeMessage).toHaveBeenCalledExactlyOnceWith(msg);
    expect(settler.deadLetterMessage).not.toHaveBeenCalled();
    expect(settler.abandonMessage).not.toHaveBeenCalled();
  });

  it("dead-letters with reason and description on a conflict", async () => {
    provision.mockRejectedValue(new AuthProvisioningConflictError("admin_email_conflict", "conflict"));
    const msg = message(payload());

    await handler()(msg as never);

    expect(settler.deadLetterMessage).toHaveBeenCalledExactlyOnceWith(msg, {
      deadLetterReason: "ProvisioningConflict",
      deadLetterErrorDescription: "conflict",
    });
    expect(settler.completeMessage).not.toHaveBeenCalled();
    expect(settler.abandonMessage).not.toHaveBeenCalled();
  });

  it("dead-letters a malformed payload", async () => {
    const msg = message("{not json");

    await handler()(msg as never);

    expect(settler.deadLetterMessage).toHaveBeenCalledExactlyOnceWith(msg, {
      deadLetterReason: "MalformedPayload",
      deadLetterErrorDescription: expect.any(String),
    });
  });

  it("abandons on a transient error", async () => {
    provision.mockRejectedValue(new Error("db down"));
    const msg = message(payload());

    await handler()(msg as never);

    expect(settler.abandonMessage).toHaveBeenCalledExactlyOnceWith(msg);
    expect(settler.completeMessage).not.toHaveBeenCalled();
    expect(settler.deadLetterMessage).not.toHaveBeenCalled();
  });

  it("completes events of other modules", async () => {
    const msg = message(payload({ module: "billing" }), { eventType: "CompanyModuleSubscribed", module: "billing" });

    await handler()(msg as never);

    expect(settler.completeMessage).toHaveBeenCalledExactlyOnceWith(msg);
    expect(provision).not.toHaveBeenCalled();
  });
});

describe("decideCompanyEvent — AuthUserProvisioned for crm", () => {
  const reply = (overrides: Record<string, unknown> = {}) => ({
    crmUserId: randomUUID(),
    authUserId: randomUUID(),
    authCompanyId: randomUUID(),
    outcome: "created",
    correlationId: "corr-1",
    occurredAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  });
  const replyMessage = (body: unknown) =>
    message(body, { eventType: "AuthUserProvisioned", module: "crm", correlationId: "corr-1" });

  it("links on outcome created and completes", async () => {
    const body = reply();

    expect(await decideCompanyEvent(replyMessage(body), deps)).toEqual({ kind: "complete" });
    expect(linkAuthUser).toHaveBeenCalledWith({
      crmUserId: body.crmUserId,
      authUserId: body.authUserId,
      authCompanyId: body.authCompanyId,
    });
    expect(provision).not.toHaveBeenCalled();
  });

  it("completes a redelivery (idempotent no-op result) with an info log", async () => {
    linkAuthUser.mockResolvedValue("already_linked");

    expect(await decideCompanyEvent(replyMessage(reply()), deps)).toEqual({ kind: "complete" });
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["user_not_found", "warn"],
    ["different_auth_user", "warn"],
    ["auth_user_in_use", "error"],
    ["company_mismatch", "error"],
  ] as const)("completes and logs at %s level when the service reports %s", async (result, level) => {
    linkAuthUser.mockResolvedValue(result);

    expect(await decideCompanyEvent(replyMessage(reply()), deps)).toEqual({ kind: "complete" });
    expect(log[level]).toHaveBeenCalledTimes(1);
    expect(log.info).not.toHaveBeenCalled();
  });

  it.each(["already_exists", "failed"])("does not link on %s: warns with reason and completes", async (outcome) => {
    const body = reply({ outcome, authUserId: null, reason: "email_taken" });

    expect(await decideCompanyEvent(replyMessage(body), deps)).toEqual({ kind: "complete" });
    expect(linkAuthUser).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome, reason: "email_taken", correlationId: "corr-1" }),
      expect.any(String),
    );
  });

  it.each([
    ["crmUserId is not a uuid", { crmUserId: "nope" }],
    ["authCompanyId is missing", { authCompanyId: undefined }],
    ["outcome is unknown", { outcome: "maybe" }],
    ["created without authUserId", { authUserId: null }],
    ["authUserId is not a uuid", { authUserId: "nope" }],
  ])("dead-letters when %s", async (_label, overrides) => {
    const decision = await decideCompanyEvent(replyMessage(reply(overrides)), deps);

    expect(decision).toMatchObject({ kind: "deadLetter", reason: "InvalidPayload" });
    expect(linkAuthUser).not.toHaveBeenCalled();
  });

  it("dead-letters a malformed body", async () => {
    expect(await decideCompanyEvent(replyMessage("{not json"), deps)).toMatchObject({
      kind: "deadLetter",
      reason: "MalformedPayload",
    });
  });

  it("abandons on an unexpected error so the broker redelivers", async () => {
    linkAuthUser.mockRejectedValue(new Error("db down"));

    expect(await decideCompanyEvent(replyMessage(reply()), deps)).toEqual({ kind: "abandon" });
  });

  it("still completes unknown event types and other modules without linking", async () => {
    const unknown = message(reply(), { eventType: "SomethingElse", module: "crm" });
    const otherModule = message(reply(), { eventType: "AuthUserProvisioned", module: "billing" });

    expect(await decideCompanyEvent(unknown, deps)).toEqual({ kind: "complete" });
    expect(await decideCompanyEvent(otherModule, deps)).toEqual({ kind: "complete" });
    expect(linkAuthUser).not.toHaveBeenCalled();
  });
});
