import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({ prisma: {} }));

import { enqueueCrmUserCreated } from "../src/messaging/crm-user-created.js";

/**
 * crm-user-auth-provisioning (C1): payload of `CrmUserCreated` and the rules
 * that suppress it, against a fake transaction client (no database).
 */
const NOW = new Date("2026-09-21T12:00:00.000Z");
const AUTH_COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const create = vi.fn();
const tx = { outboxMessage: { create } } as never;

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ id: "outbox-1" });
});

const base = {
  crmUserId: "user-1",
  loginEmail: "  Ana.Perez@Acme.COM ",
  fullName: "Ana Perez",
  crmRole: "ASESOR" as const,
  empresa: { authCompanyId: AUTH_COMPANY },
  now: NOW,
};

describe("enqueueCrmUserCreated", () => {
  it("writes one pending row through the caller's tx with the contract payload", async () => {
    await expect(enqueueCrmUserCreated(tx, base)).resolves.toBe(true);

    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0];
    expect(data.eventType).toBe("CrmUserCreated");
    expect(data.aggregateId).toBe("user-1");
    expect(data.payload).toEqual({
      crmUserId: "user-1",
      email: "ana.perez@acme.com",
      fullName: "Ana Perez",
      authCompanyId: AUTH_COMPANY,
      crmRole: "ASESOR",
      correlationId: data.correlationId,
      occurredAt: "2026-09-21T12:00:00.000Z",
    });
    expect(data.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(["ADMINISTRADOR", "SUPERVISOR", "ASESOR", "VENDEDOR"] as const)("emits for %s", async (crmRole) => {
    await expect(enqueueCrmUserCreated(tx, { ...base, crmRole })).resolves.toBe(true);
    expect(create.mock.calls[0][0].data.payload.crmRole).toBe(crmRole);
  });

  it.each(["ADMINISTRADOR_HOLDING", "SUPERVISOR_HOLDING", "SUPER_ADMIN"] as const)(
    "does not emit for the holding-wide role %s",
    async (crmRole) => {
      await expect(enqueueCrmUserCreated(tx, { ...base, crmRole })).resolves.toBe(false);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("does not emit without an empresa or when the empresa has no authCompanyId", async () => {
    await expect(enqueueCrmUserCreated(tx, { ...base, empresa: null })).resolves.toBe(false);
    await expect(enqueueCrmUserCreated(tx, { ...base, empresa: { authCompanyId: null } })).resolves.toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates a failed write so the caller's transaction rolls back", async () => {
    create.mockRejectedValue(new Error("insert failed"));
    await expect(enqueueCrmUserCreated(tx, base)).rejects.toThrow("insert failed");
  });
});
