import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openEventStream: vi.fn() }));
vi.mock("../src/services/eventos.service.js", () => ({ openEventStream: mocks.openEventStream }));
vi.mock("../src/services/presencia.service.js", () => ({
  registerPresenceConnection: vi.fn(() => ({ touch: vi.fn(), close: vi.fn() })),
}));

import { getEvents } from "../src/controllers/eventos.controller.js";

function call(user: Record<string, unknown>): void {
  getEvents({ user } as unknown as Request, {} as Response);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /eventos — holding scope (T5b)", () => {
  const base = { id: "u1", sessionScope: "holding", empresaId: null };

  it("subscribes a holding admin with its holdingId", () => {
    call({ ...base, rol: "ADMINISTRADOR_HOLDING", holdingId: "h-1" });
    expect(mocks.openEventStream.mock.calls[0]![3]).toEqual({ sessionScope: "holding", empresaId: null, holdingId: "h-1" });
  });

  it("SUPER_ADMIN keeps the global channel (holdingId null)", () => {
    call({ ...base, rol: "SUPER_ADMIN", holdingId: null });
    expect(mocks.openEventStream.mock.calls[0]![3]).toMatchObject({ holdingId: null });
  });

  it("fails closed (403) for a holding session without holdingId", () => {
    expect(() => call({ ...base, rol: "ADMINISTRADOR_HOLDING", holdingId: null })).toThrowError(
      expect.objectContaining({ code: "identidad_no_vinculada", statusHttp: 403 }),
    );
    expect(mocks.openEventStream).not.toHaveBeenCalled();
  });
});
