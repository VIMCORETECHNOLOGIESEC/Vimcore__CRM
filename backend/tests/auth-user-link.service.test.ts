import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = { marker: "tx" };
const usuarioRepository = {
  findById: vi.fn(),
  findByAuthUserId: vi.fn(),
  findByEmail: vi.fn(),
  linkAuthUserIfUnlinked: vi.fn(),
};
const membresiaRepository = { findActivasByUsuarioId: vi.fn() };
const empresaRepository = { findById: vi.fn() };
const runAsSystem = vi.fn(<T>(fn: () => T) => fn());

vi.mock("../src/lib/prisma.js", () => ({
  AUTH_PROVISIONING_TRANSACTION_BOUNDS: { maxWait: 1, timeout: 1 },
  runAsSystem: (fn: () => unknown) => runAsSystem(fn),
  runInTransaction: (_tx: unknown, fn: (t: unknown) => unknown) => fn(tx),
}));
vi.mock("../src/repositories/usuario.repository.js", () => usuarioRepository);
vi.mock("../src/repositories/membresia.repository.js", () => membresiaRepository);
vi.mock("../src/repositories/empresa.repository.js", () => empresaRepository);

const { linkAuthUser } = await import("../src/services/auth-user-link.service.js");

const input = { crmUserId: randomUUID(), authUserId: randomUUID(), authCompanyId: randomUUID() };

beforeEach(() => {
  vi.clearAllMocks();
  usuarioRepository.findById.mockResolvedValue({ id: input.crmUserId, authUserId: null });
  usuarioRepository.findByAuthUserId.mockResolvedValue(null);
  usuarioRepository.linkAuthUserIfUnlinked.mockResolvedValue(true);
  membresiaRepository.findActivasByUsuarioId.mockResolvedValue([{ empresaId: "empresa-1" }]);
  empresaRepository.findById.mockResolvedValue({ id: "empresa-1", authCompanyId: input.authCompanyId });
});

describe("linkAuthUser", () => {
  it("links an unlinked user whose empresa matches, as system, never by email", async () => {
    await expect(linkAuthUser(input)).resolves.toBe("linked");

    expect(runAsSystem).toHaveBeenCalledTimes(1);
    expect(usuarioRepository.linkAuthUserIfUnlinked).toHaveBeenCalledWith(input.crmUserId, input.authUserId, tx);
    expect(usuarioRepository.findByEmail).not.toHaveBeenCalled();
  });

  it("is idempotent when the user already has the same authUserId", async () => {
    usuarioRepository.findById.mockResolvedValue({ id: input.crmUserId, authUserId: input.authUserId });

    await expect(linkAuthUser(input)).resolves.toBe("already_linked");
    expect(usuarioRepository.linkAuthUserIfUnlinked).not.toHaveBeenCalled();
  });

  it("never overwrites a different authUserId", async () => {
    usuarioRepository.findById.mockResolvedValue({ id: input.crmUserId, authUserId: randomUUID() });

    await expect(linkAuthUser(input)).resolves.toBe("different_auth_user");
    expect(usuarioRepository.linkAuthUserIfUnlinked).not.toHaveBeenCalled();
  });

  it("does not link when the authUserId belongs to another Usuario", async () => {
    usuarioRepository.findByAuthUserId.mockResolvedValue({ id: randomUUID(), authUserId: input.authUserId });

    await expect(linkAuthUser(input)).resolves.toBe("auth_user_in_use");
    expect(usuarioRepository.linkAuthUserIfUnlinked).not.toHaveBeenCalled();
  });

  it("reports user_not_found without linking", async () => {
    usuarioRepository.findById.mockResolvedValue(null);

    await expect(linkAuthUser(input)).resolves.toBe("user_not_found");
    expect(usuarioRepository.linkAuthUserIfUnlinked).not.toHaveBeenCalled();
  });

  it("does not link when the empresa authCompanyId differs", async () => {
    empresaRepository.findById.mockResolvedValue({ id: "empresa-1", authCompanyId: randomUUID() });

    await expect(linkAuthUser(input)).resolves.toBe("company_mismatch");
    expect(usuarioRepository.linkAuthUserIfUnlinked).not.toHaveBeenCalled();
  });

  it("does not link a user without memberships (no empresa to verify)", async () => {
    membresiaRepository.findActivasByUsuarioId.mockResolvedValue([]);

    await expect(linkAuthUser(input)).resolves.toBe("company_mismatch");
    expect(usuarioRepository.linkAuthUserIfUnlinked).not.toHaveBeenCalled();
  });

  it("re-reads after losing a compare-and-set race", async () => {
    usuarioRepository.linkAuthUserIfUnlinked.mockResolvedValue(false);
    usuarioRepository.findById
      .mockResolvedValueOnce({ id: input.crmUserId, authUserId: null })
      .mockResolvedValueOnce({ id: input.crmUserId, authUserId: input.authUserId });

    await expect(linkAuthUser(input)).resolves.toBe("already_linked");
  });

  it("maps a unique violation to auth_user_in_use and rethrows other errors", async () => {
    usuarioRepository.linkAuthUserIfUnlinked.mockRejectedValueOnce({ code: "P2002" });
    await expect(linkAuthUser(input)).resolves.toBe("auth_user_in_use");

    usuarioRepository.linkAuthUserIfUnlinked.mockRejectedValueOnce(new Error("db down"));
    await expect(linkAuthUser(input)).rejects.toThrow("db down");
  });
});
