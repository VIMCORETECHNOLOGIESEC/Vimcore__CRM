import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** crm-user-auth-provisioning (C1): static checks on the outbox migration text. */
const sql = readFileSync(
  new URL("../prisma/migrations/20260921170000_crm_outbox_messages/migration.sql", import.meta.url),
  "utf-8",
);
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf-8");
const code = sql.replace(/^--.*$/gm, "");

describe("outbox_messages migration", () => {
  it("creates the status enum and the table with the publisher columns", () => {
    expect(code).toContain('CREATE TYPE "outbox_message_status" AS ENUM (\'pending\', \'processing\', \'published\', \'failed\')');
    expect(code).toContain('CREATE TABLE "outbox_messages"');
    for (const column of [
      "id", "event_type", "aggregate_id", "correlation_id", "payload", "status", "attempt_count",
      "next_attempt_at", "locked_until", "claimed_by", "last_error", "created_at", "published_at",
    ]) {
      expect(code).toContain(`"${column}"`);
    }
    expect(code).toContain('CREATE INDEX "idx_outbox_messages_poll" ON "outbox_messages"("status", "next_attempt_at")');
  });

  it("is a system table: no RLS and no tenant column", () => {
    expect(code).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toContain("empresa_id");
  });

  it("grants crm_app SELECT, INSERT, UPDATE (no DELETE)", () => {
    expect(code).toContain('GRANT SELECT, INSERT, UPDATE ON "outbox_messages" TO "crm_app"');
    expect(code).not.toMatch(/GRANT[^;]*DELETE/i);
  });

  it("matches the Prisma model mapping", () => {
    expect(schema).toContain('@@map("outbox_messages")');
    expect(schema).toContain('@@map("outbox_message_status")');
    expect(schema).toContain('map: "idx_outbox_messages_poll"');
  });
});
