# Feature: holding-admin-gateway-auth

Move the CRM to the shared platform auth (gateway trust for ALL routes), drop the CRM's own login/JWT, and
introduce an explicit `ADMINISTRADOR_HOLDING` role so a user coming from auth lands directly on the
holding administration screen (`/empresas`).

Branch: `feat/holding-admin-gateway-auth` (stacked on `feat/cliente-empresa-tenant-isolation`; multi-repo: CRM, Api_gateway, Auth)

## Decisions (closed with the user)

1. Handoff = full gateway trust (option 3): the CRM stops issuing/validating its own JWT; every `/api/v1` route is trusted via the gateway.
2. The CRM is the source of truth for role and holding. The gateway only asserts identity (`authUserId`, and the company when the session has one); the CRM resolves role, scope, holding and empresas from its own DB via `Usuario.authUserId`.
3. `ADMINISTRADOR_HOLDING` is an explicit role (the SaaS model): it can create and administer several empresas. `ADMINISTRADOR` administers a single empresa. Holding scope stops meaning "Usuario without Membresia".
4. A visitor with no auth session who opens the CRM link is denied and redirected to the auth frontend.

5. Authenticated in auth but with no CRM link (`identidad_no_vinculada`): the CRM auto-provisions its own Empresa/Usuario from an auth domain event over Azure Service Bus (the test Service Bus the stack already has). Details (payload, role of the first user, idempotency) are being mapped before implementation.

6. The first admin of a newly registered company becomes `ADMINISTRADOR_HOLDING` of a NEW holding that contains the company's empresa (CRM `Holding` = company legal name, `Empresa` linked via `authCompanyId`, `Usuario` linked via `authUserId`, no Membresia).
7. CORRECTED by the user: auth fires the CRM event when the company SUBSCRIBES TO THE CRM MODULE (not at registration), atomically through the outbox, carrying the admin's `adminUserId`, `adminEmail`, `adminFullName`; users added later, and `CompanyModuleUnsubscribed` handling, are out of this iteration (unsubscribe is only logged). The registration-time emission of commit fff6349 is being undone; the admin fields on the subscribe/re-activation paths stay.
8. Security: the CRM must NEVER auto-link an existing CRM `Usuario` by email to a newly announced auth user (auth email ownership is not verified; that would be an account takeover). An email collision is a conflict to dead-letter/log, not to merge.

## Open decisions

- `SUPER_ADMIN` on the gateway trust path (no holdingId/Membresia) is not resolved.
- Users added later to an existing company, and what `CompanyModuleUnsubscribed` should do in the CRM.
- Whether the CRM keeps its own login as a fallback (currently assumed: removed).

## Tasks

- [x] T1. CRM data model: `Holding` model on the existing `holdings` table, `RolUsuario.ADMINISTRADOR_HOLDING`, user-to-holding link, backfill of existing holding-scope admins (includes the untracked `holding_tenant_table` migration, which now belongs to this feature)
  - Evidence: `tsc` clean and full vitest 1587/1588 observed by the writer on a throwaway Postgres (the single failure was an enum assertion, fixed; the 3 affected files re-ran 28/28; the full suite was not repeated after the fix). Backfill hand-tested on 6 scenarios.
  - Commit: fcffb65
- [x] T2. CRM backend: generalize `requireGatewayTrust` to resolve role/scope/holding from the DB for any route; `requireAuthentication` on `/api/v1` accepts gateway trust OR the CRM JWT (transitional dual mode, JWT removed later); `CORS_ORIGIN` is now a list
  - Evidence: `tsc` clean and full vitest 149/149 files, 1621/1621 tests, run by the writer after the final edit on a throwaway Postgres (not re-run by the orchestrator)
  - Open: `SUPER_ADMIN` has no holdingId/Membresia, so it gets `identidad_no_vinculada` on the trust path
  - Commit: 6fea91f
- [x] T3. Api_gateway: proxy `/crm/*` to the CRM `/api/v1` with the identity headers (repo Vimcore__Api_gateway)
  - Evidence: typecheck clean, 123/123 unit tests and 1/1 e2e reported by the writer after the final edit, all against a mocked `fetch` (never tried against a real CRM: uploads/exports unverified)
  - Commit: see Vimcore__Api_gateway `feat(crm): proxy /crm/* ...` on feat/holding-admin-gateway-auth
- [x] T4. CRM frontend: remove the login page, bootstrap from the gateway session, redirect to auth when there is no session, land on `/empresas` for `ADMINISTRADOR_HOLDING`
  - Evidence: `tsc` clean and full vitest 143 files / 1368 tests reported by the writer after the final edit (no lint script); never run against the real gateway
  - Risks: pre-session calls (`marca-publica`, OAuth callbacks) and cross-origin logout unverified; cached brand now used whenever present
  - Commit: c6a9969
- [x] T5a. Api_Auth: emit `CompanyModuleSubscribed` (crm) at company registration, atomically via the outbox, with `adminUserId`/`adminEmail`/`adminFullName` (also on the re-activation path); registration and billing flows must not change
  - Deviation: NO crm subscription row is created at registration (an active row would change `/auth/me` `availableModules` and the auth frontend's post-login redirect); only the event is emitted
  - Evidence: typecheck clean, 103/103 unit tests reported by the writer; the integration test proving company+user+event commit/roll back together was NOT run
  - Commit: fff6349 (repo Vimcore__Api_Auth)
  - CORRECTION (user decision): the trigger moved from registration to CRM module subscription. Commit 99fcce3 (Vimcore__Api_Auth) undoes the registration-time emission and keeps the admin fields on the subscribe/re-activation paths; unit suite 99/99, typecheck clean (writer-reported). Registration is back to its original behavior. The subscribe path is atomic through `createWithOutboxEvent` and creates an active crm subscription row.
  - Unverified: that the company admin role gets `admin:create` at registration (needed to subscribe from the auth frontend); a second subscribe emits a second event (the CRM consumer is idempotent by design and its tests cover it, but not against a real broker).
- [x] T5b. CRM: Service Bus consumer + idempotent provisioning (Holding + Empresa + ADMINISTRADOR_HOLDING Usuario) + emulator subscription `crm-company-events` + compose env
  - Evidence: `tsc` clean and full vitest 153 files / 1671 tests reported by the writer on a throwaway Postgres; NOT verified end to end against the Service Bus emulator or Azure
  - Commit: see `feat(provisioning): ...` on feat/holding-admin-gateway-auth
  - Manual infra: the Azure subscription `crm-company-events` on `vimcore-domain-events` and the receiver role must be created by hand; the local emulator must be restarted to load `ops/servicebus-emulator/config.json`
- [ ] T6. Environment wiring: `CRM_GATEWAY_SECRET` shared by CRM and gateway, `CRM_BASE_URL`, CORS origins, cookie domain, frontend base URLs
  - Commit: pending

## Follow-ups

- The CRM test setup overrides `DATABASE_URL` from `.env.dev`; running tests in place can truncate the dev DB (add a guard).
