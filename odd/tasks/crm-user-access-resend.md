# crm-user-access-resend

## Objective
Give admins a place to RESEND the access email (a NEW temporary password) to a user who has not finished onboarding, both from the CRM and from Auth. Backend/API only in this feature; no UI (the CRM frontend is being reshaped by someone else, and Auth has no admin UI).

## Decisions (agent defaults, user asked only for "a place to resend the email in CRM and Auth"; flagged and reversible)
1. A resend generates a NEW temporary password (the old one is stored hashed and cannot be recovered) and emails it. It is allowed ONLY while `mustChangePassword` is true (the user never set their own password); otherwise outcome `not_pending` (forgotten-password recovery is a separate feature, not in scope).
2. Anti-abuse cooldown: 5 minutes per user. Auth uses a Redis key with TTL (the service already has Redis); the CRM checks its own outbox for a recent `CrmUserAccessResendRequested` row of that user (no migration).
3. Send-then-commit ordering in Auth for resends: generate + hash the password, send the email FIRST; only if the send succeeded commit the new hash (+ inbox + reply). If the send fails nothing changes (the previous temp password stays valid) and the reply is `failed/email_send_failed`, so the admin can retry.
4. The CRM verifies the user is linked (`authUserId`) and in the caller's scope; Auth verifies that the email sent by the CRM equals its own stored email (mismatch => `email_mismatch`, nothing sent) so a stale CRM never mails a wrong address.
5. Results reach the CRM caller only through logs/the event reply (the CRM answers 202 "requested"); no notification/UI work.

## Contract (topic `vimcore-domain-events`, applicationProperties `{eventType, module:"crm", correlationId}`, MessageId = outbox id; bodies arrive already JSON-decoded by the SDK)
- `CrmUserAccessResendRequested` (CRM -> Auth, subscription `auth-crm-events`): `{ crmUserId (uuid), authUserId (uuid), authCompanyId (uuid), email (CRM current login email, trim+lowercase), correlationId, occurredAt }`.
- `AuthUserAccessResent` (Auth -> CRM, `crm-company-events`): `{ crmUserId, authUserId, authCompanyId, outcome: "sent"|"not_pending"|"email_mismatch"|"cooldown"|"failed", reason?, correlationId, occurredAt, module:"crm" }`.

## Tasks
- [x] F1 DONE (Auth API + gateway commits after a983be2 / dd37b6d; ~780 lines; writer-reported: Auth unit 160 pass + tsc ok, gateway vitest 139 pass + tsc ok; Drizzle SQL for setTemporaryPassword/commitAccessResend, Redis SET NX EX, router wiring and Resend delivery NEVER run). Route deviation: Auth has no /admin/users/*; the real route is `POST /companies/:companyId/users/:userId/resend-access` (admin:update + same company; other company => 403, user of another company under own path => 404), served by the gateway as `POST /admin/users/:userId/resend-access` (admin:update). Gateway maps every Auth 5xx to 502 UPSTREAM_ERROR. Commit failure after a successful send releases the cooldown and abandons the message. (original:) F1 Auth API + gateway (branch `feat/crm-user-provisioning` in `Vimcore__Api_Auth` and `Vimcore__Api_gateway`): shared use case `resendTemporaryPassword`; event handler for `CrmUserAccessResendRequested` (router already exists: src/infrastructure/messaging/crm-user-event-router.ts) with reply `AuthUserAccessResent`; admin HTTP endpoint `POST /admin/users/:userId/resend-access` in Auth (same authorization pattern as the other `/admin/users/*` routes) proxied by the gateway; new email template or reuse of the access-updated template.
- [x] F2 DONE (CRM commit after 9854813; ~530 lines incl. ~230 tests; writer-reported: 94 non-DB tests pass in 3 files, tsc only stale-client/stub errors; findRecentOutboxEvent and the transaction NEVER run on Postgres; the route is only checked by inspecting the router stack). Only ADMINISTRADOR (+ holding bypass) may call it, SUPERVISOR cannot (user to confirm); no row lock so two concurrent requests may both enqueue (Auth's Redis cooldown limits the effect); an ADMINISTRADOR targeting ADMINISTRADOR_HOLDING/SUPER_ADMIN gets 403 permiso_denegado. (original:) F2 CRM (branch `feat/crm-user-auth-provisioning`): endpoint `POST /usuarios/:id/reenviar-acceso` (admin roles, existing scope checks), linked-user and cooldown checks, enqueue `CrmUserAccessResendRequested`, handler branch for `AuthUserAccessResent` (structured log with `holdingWide:true`).
- [ ] F3 Tests per task (non-DB) and a manual test plan.

## Risks
- The first email may have gone to a wrong recipient; nothing recalls it (resend only fixes the flow, the email must be corrected first through the email-change flow).
- Email delivery failures are only visible in logs.
- CRM JWTs already issued stay valid until expiry.

## Progress
Design recorded. F1 and F2 starting in parallel.

## Verification evidence
(none yet)

## Next step
F1 + F2 via delegated writers.
