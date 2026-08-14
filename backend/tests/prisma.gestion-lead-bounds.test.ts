import { describe, expect, it } from "vitest";
import { GESTION_LEAD_TRANSACTION_BOUNDS } from "../src/lib/prisma.js";

describe("lib/prisma — GESTION_LEAD_TRANSACTION_BOUNDS (M5, DD4)", () => {
  it("define maxWait y timeout positivos, independientes de dedupe/ingesta", () => {
    expect(GESTION_LEAD_TRANSACTION_BOUNDS.maxWait).toBeGreaterThan(0);
    expect(GESTION_LEAD_TRANSACTION_BOUNDS.timeout).toBeGreaterThan(0);
    expect(GESTION_LEAD_TRANSACTION_BOUNDS.timeout).toBeGreaterThanOrEqual(
      GESTION_LEAD_TRANSACTION_BOUNDS.maxWait,
    );
  });
});
