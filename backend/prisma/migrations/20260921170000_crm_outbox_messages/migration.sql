-- crm-user-auth-provisioning (C1): transactional outbox for integration events
-- (first event: `CrmUserCreated`, published to the shared Service Bus topic).
--
-- System table, NOT tenant data: no `empresa_id` and deliberately NO row level
-- security (same criterion as `reporte_jobs` / `holdings`). The publisher loop
-- drains it through the application role under `runAsSystem`, and producers
-- insert inside the caller's own transaction.

CREATE TYPE "outbox_message_status" AS ENUM ('pending', 'processing', 'published', 'failed');

CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_message_status" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(6),
    "claimed_by" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- Polling query: WHERE status IN ('pending','processing') ORDER BY next_attempt_at.
CREATE INDEX "idx_outbox_messages_poll" ON "outbox_messages"("status", "next_attempt_at");

-- `crm_app` only received DML on tables that existed when
-- 20260827100000_rls_tenant_isolation ran (`GRANT ... ON ALL TABLES`) plus what
-- its ALTER DEFAULT PRIVILEGES covers for objects created by the migration role.
-- The explicit grant makes the outbox contract independent of that ordering.
-- No DELETE: published rows are kept as an audit trail.
GRANT SELECT, INSERT, UPDATE ON "outbox_messages" TO "crm_app";
