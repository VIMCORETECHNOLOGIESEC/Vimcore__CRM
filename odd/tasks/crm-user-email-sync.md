# crm-user-email-sync

## Objective
When the login email of a CRM user is changed in the CRM, Auth must be updated too. ONLY when the email really changed, Auth issues a NEW temporary password (mustChangePassword=true), revokes the user's sessions and emails the password to the NEW address. If Auth cannot apply the change, the CRM reverts (user decision: option 1, apply in the CRM immediately and compensate).

## Problem (reported by the user, verified by exploration)
A CRM admin created a user with a wrong email, later corrected it, and the temporary-password email never reached the correct address: `PATCH /usuarios/:id` (updateUsuario) only rewrites the CRM row, in no transaction, without comparing with the previous value, and never tells Auth.

## Decisions
- User: option 1 = the CRM stores the new email immediately and compensates (reverts) when Auth replies conflict/failed.
- Defaults chosen by the agent (flagged to the user, reversible):
  1. Ordering/idempotency by compare-and-set on `oldEmail` (no version columns): Auth applies only when its current email equals `oldEmail`; equal to `newEmail` => `unchanged`; anything else => `stale` (CRM logs a warning and does NOT revert).
  2. Unlinked users (`authUserId` null) cannot have their login email changed: 409 `usuario_sin_vinculo_auth` until the Auth link exists (a silent skip would reproduce the reported bug).
  3. `PATCH /usuarios/:id` `correo` edits the REAL login email per role: for empresa-level portador users (ADMINISTRADOR/SUPERVISOR/ASESOR created inside an empresa) that is `Membresia.correo` of the active membership (Usuario.correo stays synthetic); for VENDEDOR/ASESOR created through POST /usuarios it is `Usuario.correo`. Holding-wide roles are not synced (out of scope, no Auth user).
  4. A case-only change (citext-equal) counts as unchanged: no event, no email.
  5. Revert on conflict/failed only if the current CRM email still equals `newEmail`, and the revert never emits another Auth event.
  6. Auth resets no other profile data; `emailVerifiedAt` is left as is (flag).

## Event contract (topic `vimcore-domain-events`, applicationProperties `{eventType, module:"crm", correlationId}`, MessageId = outbox id)
- `CrmUserEmailChanged` (CRM -> Auth), on subscription `auth-crm-events`: `{ crmUserId (uuid), authUserId (uuid), authCompanyId (uuid), oldEmail, newEmail (both trimmed+lowercased), correlationId, occurredAt }`.
- `AuthUserEmailUpdated` (Auth -> CRM), on `crm-company-events`: `{ crmUserId, authUserId, authCompanyId, outcome: "updated"|"unchanged"|"conflict"|"stale"|"failed", reason?, email (Auth email after processing), correlationId, occurredAt, module:"crm" }`.
- Auth behaviour: user looked up by `authUserId` (+ company match) else `failed/user_not_found`; new email `findByEmail` owned by another user => `conflict`; else in ONE transaction update email + new password hash + mustChangePassword=true + inbox row + reply outbox row; after commit revoke ALL sessions and send the email to the new address (best effort, no resend mechanism yet). Bodies arrive already JSON-decoded by the Service Bus SDK (object), see bugfix 06e8f21.

## Tasks
- [x] E1 DONE (CRM commit after 9c1a681; ~350 lines incl. 240 tests; writer-reported: 37 non-DB tests pass with @azure stubbed, tsc only stale-client errors; transaction/rollback/citext/unique constraints and DB-backed PATCH tests NEVER run). Gaps: VENDEDOR/ASESOR via POST /usuarios assumed to log in with Usuario.correo (unconfirmed); several active memberships => first one; `activo=false` in the same PATCH has no session revocation; portador PATCH response still returns the synthetic Usuario.correo; the written email keeps caller case (only the event lowercases). (original:) E1 CRM (branch `feat/crm-user-auth-provisioning`): resolve the login email per role; transactional `updateUsuario`/PATCH correo: read current, uniqueness across Usuario.correo AND Membresia.correo (`assertCorreoDisponible`, currently not called by PATCH), update, enqueue `CrmUserEmailChanged` in the same transaction; unlinked => 409; unchanged => no event.
- [x] E2 DONE (Auth API commit after 06e8f21; writer-reported: unit suite 138 pass, tsc clean; Drizzle `commitEmailChange` SQL, real unique violation, broker round trip, Resend and Redis session revocation NEVER run). Outcomes: updated/unchanged/stale/conflict/failed(user_not_found)/duplicate; `failed` writes no inbox row so a redelivery re-sends the reply; emailVerifiedAt and status untouched; router `crm-user-event-router.ts` dispatches by eventType. (original:) E2 Auth API (branch `feat/crm-user-provisioning`): `UserRepository.updateEmail`, `commitEmailChange` in the provisioning repository (transaction), use case with outcomes updated/unchanged/conflict/stale/failed, dispatch of a second event type in the `auth-crm-events` consumer, new email template ("your access email was updated" + temporary password), session revocation after commit, reply `AuthUserEmailUpdated` through the outbox.
- [x] E3 DONE (CRM commit after 7f4eeab; ~500 lines incl. ~300 tests; writer-reported: 75 non-DB tests pass in 3 files, tsc clean for touched files; transaction, citext equality in updateMany, unique-violation path and outbox lookup NEVER run against Postgres). Revert outcomes and their causes are all logged with holdingWide:true (ids and correlationId only, no emails). GAPS: no admin notification (would need a new TipoNotificacion enum value = migration); `stale` and every "not reverted" outcome leave the CRM out of sync with Auth until someone reads the log; several active memberships => first one; HOLDING_WIDE_ROLES list is duplicated three times. (original:) E3 CRM consumer of `AuthUserEmailUpdated`: conflict/failed => revert (compare-and-set on the current email), log/notify; updated/unchanged/stale => log; register the event type in the handler.
- [ ] E4 Tests per task (non-DB), manual end-to-end plan for the user.

## Constraints
- Never read real `.env`; agent has no Postgres access for writes beyond what the user authorizes; DB-backed checks are run by the user. English artifacts. No AI attribution in commits.

## Risks
- Lost/failed email after commit leaves the user unable to log in (no resend yet). A wrong-recipient email cannot be recalled.
- Between the CRM change and Auth's reply the login email differs (accepted by option 1); a `stale` outcome needs manual attention.
- CRM JWTs already issued stay valid until expiry (Auth revokes only its own sessions).
- Portador users had NO way to edit Membresia.correo before; E1 introduces it through PATCH.

## Progress
Exploration done. Starting E1 and E2 in parallel (different repos).

## Verification evidence
(none yet)

## Next step
E1 + E2 via delegated writers, then E3.
