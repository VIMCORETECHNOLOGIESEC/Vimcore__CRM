# CRM company event consumer — explicit errors and bounded retries

## Objective
Make RabbitMQ company-event processing failures visible with the explicit cause, and stop the
infinite immediate-requeue loop.

## Problem
Production (2026-09-23 21:02) shows ~100 `level:50` lines/second as `tenant_output_suppressed` in
the CRM backend right after two `POST /subscriptions` (crm) for company `328204b6…`.
- `backend/src/messaging/crm-company-event-consumer.ts` (processMessage catch) does
  `channel.nack(message, false, true)`: immediate requeue, no cap, no delay → hot loop.
- The handler's `abandonMessage` path also requeues forever.
- Consumer/handler `logger.error` calls carry neither tenant context nor `holdingWide: true`, so
  `lib/logger.ts` replaces them with `tenant_output_suppressed` and the real cause is lost.

## Scope
- Messaging logs (consumer + company-event handler, incl. connect/start/process errors) are emitted
  with `holdingWide: true` and include the explicit error: `message`, error name/class, Prisma
  `code` when present, `stack`, plus `messageId`, `correlationId`, `eventType`, attempt number.
- Bounded retries: after a failure, retry with a delay/backoff up to a max attempt count
  (configurable via env with sane defaults); after exhausting attempts, dead-letter the message
  (nack requeue=false) and log an explicit error saying it was dead-lettered and why.
- No secrets/passwords/tokens in logs (keep existing redact paths).

## Out of scope
- Fixing the underlying provisioning failure (unknown until the explicit error is visible).
- Auth, Gateway, other consumers.

## Constraints
- TDD strict (AGENTS.md §5): RED → GREEN → TRIANGULATE → REFACTOR. Runner: `pnpm test` (vitest) in
  `backend/`. Mode source: repository AGENTS.md.
- pnpm only; Docker per repo rules.
- Do not purge the production queue: pending events for demo@demo.com must be reprocessed.

## Tasks
- [x] T1 — Explicit, visible messaging error logs (route: delegated writer, trigger: 2+ non-trivial files)
- [x] T2 — Bounded retry with delay + dead-letter after max attempts (route: same delegated writer)
- [x] T3 — No message loss: park exhausted/terminally-rejected messages in a durable
  `crm-company-events.dead` queue (persistent copy + error headers, publisher-confirmed before
  acking the original); retry republish also awaits broker confirm before ack. Reason: user
  requirement 2026-09-23 — `nack(requeue=false)` on a queue without DLX drops the message
  (applies to T2 exhaustion and pre-existing handler deadLetter decisions). Option A chosen over
  queue-arg DLX (PRECONDITION_FAILED on the existing queue) and broker policy (unversioned).
  Route: delegated writer (resumed).

## Acceptance criteria
- [x] A thrown provisioning error produces a visible (non-suppressed) log with the explicit cause.
- [x] A permanently failing message is retried at most N times with delay, then dead-lettered once.
- [x] Existing consumer/handler tests stay green.

## Progress / evidence

### Files changed
- `backend/src/lib/error-details.ts` (new) — `describeError(error)`: normalizes any thrown
  value into `{ err, code?, meta? }` so pino's `err` serializer applies and Prisma's `code`/`meta`
  survive when present.
- `backend/src/lib/logger.ts` — added `serializers: { err: pino.stdSerializers.err }` so `err`
  fields expand into `name`/`message`/`stack`.
- `backend/src/messaging/rabbitmq-retry.ts` (new) — shared `RETRY_ATTEMPT_HEADER`
  (`x-crm-attempt`), `computeRetryDelayMs` (exponential backoff, capped 30s), `readRetryAttempt`.
- `backend/src/messaging/crm-company-event-consumer.ts` — every log site now carries
  `holdingWide: true` + `describeError(...)`; `processMessage`'s catch and the handler's
  `abandonMessage` both route through a new `handleFailure` that reads the attempt count from
  `x-crm-attempt`, and below `maxAttempts` schedules a delayed `channel.sendToQueue` republish
  (incremented header) then acks the original, or dead-letters (`nack`, no requeue) once
  exhausted. `maxAttempts`/`retryBaseDelayMs` are optional on `RabbitMqConsumerSettings`
  (defaults 5 / 2000ms, mirroring the new env defaults) and resolved from env in
  `resolveRabbitMqSettings`. Added a `handlerDeps` constructor param (test seam only) so tests
  can exercise the handler's real "abandon" decision without a database.
- `backend/src/messaging/crm-company-event-handler.ts` — added `holdingWide: true` to every log
  site in `decideCompanyEvent`'s `CompanyModuleSubscribed` path that lacked it (debug filters,
  malformed-payload dead-letter, invalid-payload dead-letters, without-admin-fields warn,
  unsubscribed info, provisioning success/conflict/failure); the provisioning conflict/failure
  logs now also carry `describeError(error)` and `attempt` (read from the `x-crm-attempt`
  application property via `readRetryAttempt`).
- `backend/src/config/env.ts` — added `RABBITMQ_MAX_ATTEMPTS` (default 5) and
  `RABBITMQ_RETRY_BASE_DELAY_MS` (default 2000), same "sane default, not in `.env.example`"
  precedent already set by `OUTBOX_MAX_ATTEMPTS`/`OUTBOX_POLL_INTERVAL_MS` (which also aren't
  in `.env.example`) — `RABBITMQ_URL`/`RABBITMQ_EXCHANGE_NAME`/`RABBITMQ_CRM_QUEUE_NAME`
  themselves aren't documented there either, so adding only the two new vars would be
  inconsistent; left `.env.example` untouched (pre-existing gap, out of scope).
- `backend/tests/crm-company-event-consumer.test.ts` — updated `resolveRabbitMqSettings` test
  fixture for the two new fields; added a `sendToQueue` mock to the fake channel; added
  "bounded retry with backoff, then dead-letter" describe block with tests (b) and (c) below.
- `backend/tests/crm-company-event-handler.test.ts` — added a describe block that drives
  `decideCompanyEvent` through the REAL `createTenantLogger` (not the mocked `log`) for test (a).

### Retry mechanism chosen and why
Republish-a-copy-with-incremented-header (`x-crm-attempt`) to the same queue via
`channel.sendToQueue`, after a `setTimeout` backoff delay, then ack the original — exactly the
option the task named as not depending on quorum-queue delivery-count headers (this queue is a
plain durable classic queue). The exchange is `fanout`-typed and shared by Auth/Billing/CRM, so
retries republish directly to the queue (default exchange, not back through the fanout) to avoid
re-fanning the message out to unrelated consumers. `setTimeout` (non-blocking) instead of a
synchronous sleep keeps the delay from holding the channel/other messages hostage. Dead-letter
(`nack`, no requeue) fires once `attempt >= maxAttempts`; pending retry timers are tracked and
cleared on `close()`.

### TDD evidence (RED → GREEN)
Mode: TDD strict per AGENTS.md §5 (`pnpm test` = `vitest run` in `backend/`), confirmed with the
project's own Docker Compose (`backend` service; DB via `docker compose --env-file .env.dev up
db`; `pnpm exec prisma migrate deploy` + the same `ALTER ROLE crm_app ...` step the `backend`
service's own startup command runs, since a one-off `docker compose run` skips its automatic
dev-server bootstrap).

RED (implementation stashed via `git stash push -- <4 src files>`, tests present):
```
tests/crm-company-event-consumer.test.ts > resolveRabbitMqSettings ... resolves the settings, including the bounded-retry config
  AssertionError: expected { url, exchangeName, queueName } to deeply equal { ...+maxAttempts, retryBaseDelayMs }
tests/crm-company-event-consumer.test.ts > bounded retry ... > retries a permanently failing message up to maxAttempts, then dead-letters it exactly once
  AssertionError: expected sendToQueue to have been called ... but called only 0 times
tests/crm-company-event-consumer.test.ts > bounded retry ... > acks and stops retrying once the message succeeds on a retry
  TypeError: undefined is not iterable (sendToQueue never called)
tests/crm-company-event-handler.test.ts > ... > logs a thrown provisioning error with holdingWide and the explicit cause, never suppressed
  AssertionError: expected undefined to be defined (log line was replaced by tenant_output_suppressed, reproducing the production bug)
```
4 failed / 76 passed (consumer + handler files only). Implementation restored with
`git stash pop`.

GREEN (implementation restored):
```
tests/crm-company-event-consumer.test.ts (10 tests) — all pass, incl. both new retry tests
tests/crm-company-event-handler.test.ts (66 tests) — all pass, incl. the new non-suppressed-log test
tests/tenant-logger.test.ts (2 tests) — all pass (serializer/suppression hook unaffected)
tests/rabbitmq-env.test.ts (4 tests) — all pass (untouched by RABBITMQ_MAX_ATTEMPTS/RETRY_BASE_DELAY_MS, both have zod defaults)
```
Targeted run: 78 passed (0 failed).

Triangulation: test (b) uses `maxAttempts: 3` and drives 3 real failures (fake `provision`
rejecting every time) through the actual consumer, asserting exactly 2 `sendToQueue` calls with
`x-crm-attempt` 1 then 2, and a single final `nack(msg, false, false)` — not a single
hand-picked case. Test (c) reuses the same harness with `provision` rejecting once then
resolving, asserting the retried copy is acked and `sendToQueue`/`nack` are not called again.

### Verification (commands run and observed results)
- `pnpm exec vitest run tests/crm-company-event-consumer.test.ts tests/crm-company-event-handler.test.ts tests/tenant-logger.test.ts tests/rabbitmq-env.test.ts` (in the `backend` container): **78 passed, 0 failed**.
- `pnpm test` (full backend suite, `vitest run`, in the `backend` container): **1687 passed, 230 failed, 214 skipped (1917 total)**. All 230 failures are in files this task never touches (`tests/adversarial/rls-runtime-matrix.test.ts`, `tests/auth-provisioning.service.test.ts`, `tests/*.routes.test.ts`, `tests/matriz-roles.test.ts`, etc.) — `rg` over the full run log for `crm-company-event|rabbitmq-retry|error-details|lib/logger` inside any failure block returned **zero matches**. Re-ran 3 of the failing files in isolation (`matriz-roles`, `auth-provisioning.service`, `adversarial/rls-runtime-matrix`) and they reproduce the same failures alone (`Test timed out in 5000ms`, and `PrismaClientUnknownRequestError: new row violates row-level security policy for table "bridges"`) — a pre-existing RLS/session-setup gap in this fresh ad-hoc DB (this task's one-off `docker compose run` migration+role-password bootstrap, done to avoid the interactive `backend` dev-server command, evidently isn't 100% equivalent to whatever the full `backend` service's normal boot sequence also does for that adversarial suite). Reporting this as **partial**: the messaging/logging change is fully green and verified; the pre-existing unrelated failures are disclosed rather than hidden, and are environment/DB-bootstrap related, not caused by this diff.
- `pnpm exec tsc --noEmit -p tsconfig.json` (backend typecheck, in the `backend` container): **clean, exit code 0**.

## Next step
None pending for T1/T2. The full-suite `partial` result (pre-existing RLS/session-bootstrap
failures, unrelated to this change) may be worth a separate investigation if it also reproduces
against the normal `docker compose up` boot path (not just this one-off migration shortcut).

---

## T3 — No message loss (park instead of drop)

### Files changed
- `backend/src/messaging/rabbitmq-retry.ts` — added `DEAD_REASON_HEADER` (`x-crm-dead-reason`),
  `DEAD_DESCRIPTION_HEADER` (`x-crm-dead-description`), `DEAD_ATTEMPTS_HEADER` (`x-crm-attempts`),
  `DEAD_AT_HEADER` (`x-crm-dead-at`), `DEAD_SOURCE_QUEUE_HEADER` (`x-crm-source-queue`);
  `truncateDeadDescription` (caps the parked description at 500 chars); `confirmSendToQueue` — a
  real publisher-confirm wrapper around `ConfirmChannel.sendToQueue`'s per-message callback (see
  "API used" below).
- `backend/src/messaging/crm-company-event-consumer.ts` — `start()`'s channel setup now also
  `assertQueue`s a durable `${queueName}.dead` (or `RABBITMQ_CRM_DEAD_QUEUE_NAME` override) --
  never bound to the fanout exchange, never redeclaring the existing production queue's own
  arguments. New `parkMessage()` publishes a persistent, publisher-confirmed copy (content +
  messageId/correlationId/contentType + the `x-crm-dead-*` headers) to that queue, then acks the
  original only once confirmed; on an unconfirmed/failed publish it does **not** ack -- it calls
  the new `requeueWithDelay()` (nack, requeue=true, after `retryBaseDelayMs`) and logs an explicit
  holdingWide error instead. `handleFailure`'s exhaustion branch and `processMessage`'s
  `deadLetterMessage` settler callback (the pre-existing handler `deadLetter` decision -- malformed
  payload, invalid payload, provisioning conflict, ...) both now call `parkMessage` instead of a
  bare `nack(requeue=false)`. `scheduleRetry`'s timer callback now calls the new `republishRetry()`,
  which awaits `confirmSendToQueue` for the republished copy before acking the original, and on an
  unconfirmed publish also calls `requeueWithDelay` instead of losing the message.
- `backend/src/config/env.ts` — added `RABBITMQ_CRM_DEAD_QUEUE_NAME` (optional; undefined derives
  `${RABBITMQ_CRM_QUEUE_NAME}.dead` in `resolveRabbitMqSettings`).
- `backend/tests/crm-company-event-consumer.test.ts` — extended the fake channel's `sendToQueue`
  mock to invoke its broker-confirm callback (default: success; per-test override to simulate a
  failed/unconfirmed publish); updated the malformed-JSON `deadLetter` test and the
  exhausted-retries test to assert parking (not a bare drop nack); added tests for both
  never-lose-a-message failure paths (parking publish not confirmed, retry republish not
  confirmed); added an `assertQueue` assertion for the parking queue; extended
  `resolveRabbitMqSettings` coverage for `deadQueueName`.

### API used for the publisher confirm, and why it truly awaits the broker
`ConfirmChannel.sendToQueue(queue, content, options, callback)` -- the `@types/amqplib` signature
is `(queue, content, options?, callback?: (err, ok) => void)`. Per amqplib's confirm-channel
contract, that callback fires only once the broker has itself acked (`err` is null) or nacked
(`err` is set) the specific publish -- unlike the plain `Channel` API (no confirms at all) or
`sendToQueue`'s bare boolean return value (only reports local write-buffer backpressure, not
broker receipt). `confirmSendToQueue` (`rabbitmq-retry.ts`) wraps that callback in a `Promise` that
resolves/rejects from it, so `await confirmSendToQueue(...)` genuinely suspends until the broker
confirms -- not until the local socket write flushes. This is used identically in both
`parkMessage` and `republishRetry` before the original message is ever acked.
(`ConfirmChannel.waitForConfirms()` was considered too -- a channel-wide confirm barrier -- but the
per-message callback is more precise: it ties the wait to exactly the one publish being confirmed,
without incidentally waiting on unrelated in-flight publishes on the same channel.)

### TDD evidence (RED → GREEN)
Same Docker Compose method as T1/T2 (`db` service; migrations already applied from the T1/T2 run,
Postgres volume persisted across `docker compose down`/`up`).

RED: temporarily reverted `crm-company-event-consumer.ts`, `rabbitmq-retry.ts` and `config/env.ts`
to their exact T1/T2-only content (backed up first, restored after), keeping the new/updated T3
tests in place, then ran the targeted files:
```
tests/crm-company-event-consumer.test.ts — 6 failed / 7 passed
  × resolves the settings, including the bounded-retry and parking-queue config (missing deadQueueName)
  × parks a malformed JSON body (deadLetter) in the .dead queue instead of dropping it (old code still bare-nacked it)
  × retries a permanently failing message up to maxAttempts, then parks it exactly once (old code bare-nacked at maxAttempts)
  × never acks or drops the original when the retry republish is not confirmed (old scheduleRetry never awaited a confirm)
  × does not ack or drop the original when the parking publish is not confirmed (old code had no parking queue at all)
  × (assertQueue-for-.dead-queue assertion, folded into the "asserts the fanout exchange..." test)
tests/crm-company-event-handler.test.ts — unaffected, still 66/66 passed (T3 didn't touch the handler)
```
73 T1/T2 tests still passed alongside the 6 T3 failures, confirming the RED was isolated to the new
T3 behavior and did not regress T1/T2. Implementation restored from the backup.

GREEN (implementation restored):
```
tests/crm-company-event-consumer.test.ts (13 tests) — all pass
tests/crm-company-event-handler.test.ts (66 tests) — all pass
tests/tenant-logger.test.ts (2 tests) — all pass
tests/rabbitmq-env.test.ts (4 tests) — all pass
```
Targeted run: 85 passed (0 failed).

Triangulation: the exhausted-retries test drives 3 real failures through the full retry loop
(sendToQueue confirmed each time) and asserts the 3rd is parked, not the 1st or 2nd; the two
never-lose-a-message tests reuse the same harness but force `sendToQueue`'s confirm callback to
report an error for exactly one call (`mockImplementationOnce`), proving the original is neither
acked nor dropped in that specific failure case, distinct from the many-successful-confirms case.

### Verification (commands run and observed results)
- `pnpm exec vitest run tests/crm-company-event-consumer.test.ts tests/crm-company-event-handler.test.ts tests/tenant-logger.test.ts tests/rabbitmq-env.test.ts` (in the `backend` container): **85 passed, 0 failed**.
- `pnpm exec tsc --noEmit -p tsconfig.json` (backend typecheck, in the `backend` container): **clean, exit code 0**.
- `pnpm test` (full backend suite): **1694 passed, 226 failed, 214 skipped (1920 total)**. Same
  pre-existing, unrelated failure set as the T1/T2 run (`tests/adversarial/rls-runtime-matrix.test.ts`,
  `tests/auth-provisioning.service.test.ts`, various `*.routes.test.ts` -- identical file list to
  the T1/T2 verification run); `rg` over this run's log for `crm-company-event|rabbitmq-retry|error-details|lib/logger`
  inside any failure block again returned **zero matches**. Count moved from 230→226 failed and
  1687→1694 passed only because of the net +3 new T3 tests and normal timeout-flakiness variance in
  the same unrelated adversarial suite (not because anything was fixed or newly broken by T3).
  Reporting this as **partial** for the same disclosed, pre-existing, environment/DB-bootstrap
  reason as T1/T2 -- not re-litigated here since the RED/GREEN isolation above already proves T3
  itself is fully green.

### Operator runbook: replaying parked messages
Parked messages sit in `crm-company-events.dead` (durable, persistent) with `x-crm-dead-reason`,
`x-crm-dead-description`, `x-crm-attempts`, `x-crm-dead-at` and `x-crm-source-queue` headers
recording why/when/how-many-attempts. To reprocess them once the underlying cause is fixed:
1. Inspect them first in the RabbitMQ management UI (Queues → `crm-company-events.dead` → Get
   messages, "Requeue" unchecked) to read the headers and confirm the cause is actually resolved.
2. Move them back with the management UI's **"Move messages"** feature (Queues →
   `crm-company-events.dead` → Move messages → destination `crm-company-events`) -- this republishes
   each message to the main queue (default exchange, same as this task's own `sendToQueue` calls)
   without needing shell access. For a large backlog, an equivalent `rabbitmqadmin`/shovel-based
   move works the same way (source `crm-company-events.dead`, destination `crm-company-events`).
3. The `x-crm-attempt` (live retry counter) header is not on parked messages (only the final
   `x-crm-attempts` record is), so a moved-back message starts its retry budget fresh --
   deliberate, since an operator moving it back has presumably fixed the original cause.

## Next step
None pending for T1/T2/T3. The full-suite `partial` result (pre-existing RLS/session-bootstrap
failures, confirmed unrelated to this task across three separate runs) may be worth a separate
investigation if it also reproduces against the normal `docker compose up` boot path.
