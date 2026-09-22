# holding-scoped-tenant-isolation

## Objective
Holding-scope users (ADMINISTRADOR_HOLDING, SUPERVISOR_HOLDING) must only see data of empresas whose `holding_id` equals their own holding. Replace the unrestricted RLS bypass (`app.tenant_unrestricted='on'`) currently used for holding sessions with a holding-bound scope.

## Problem (verified)
- `require-gateway-trust.middleware.ts` runs holding users with `runWithTenantContext({empresaId:null})`, which `applyTenantGucs` (`backend/src/lib/prisma.ts`) turns into `app.tenant_unrestricted='on'`. Every RLS policy has that bypass branch, so a holding admin reads rows of ALL holdings.
- `GET /empresas` (`empresa.repository.ts` `findAll`) filters only by name search; `GET/PUT /empresas/:empresaId` never checks holding membership (cross-holding IDOR); `POST /empresas` does not set `holdingId`.
- Observed: a freshly provisioned holding admin sees 255 empresas that belong to other holdings.

## Scope
Backend of `Vimcore__CRM` only. No frontend, no Auth/Gateway changes. Own-JWT `SUPER_ADMIN` keeps global access. System jobs keep an explicit unrestricted scope.

## Constraints
- Fail closed: a holding session without `holdingId` is rejected.
- Keep policy variants (membresias/bridges/notificaciones bootstrap branches) intact.
- Never read real `.env` files. Test DB must be throwaway (tests can truncate).
- ~400 authored changed lines per task is a planning heuristic only.

## Resolved settings
- TDD mode: unresolved (no explicit config/choice). Treated as OFF; functional checks run instead. Source: none. Runner: `pnpm test` (`vitest run`, `backend/package.json`); DB-backed tests need a throwaway Postgres 16 with migrations + `crm_app` role, which the agent cannot start (no Docker socket).
- Delivery strategy: `ask-on-risk`; user chose stacked PRs to main ("todo al main", separate branch). One PR per task/slice, each targeting the immediate parent branch or main once the parent merges. Base branch carries 6 commits not yet in main (holding-admin-gateway-auth work), so PR #1 must land after (or include) that work: user decides push/PR/merge order.
- Branch: `feat/holding-scoped-tenant-isolation`, created from `feat/holding-admin-gateway-auth` (HEAD 8463046).
- RDD/native review: not enabled by the user; not started.

## Tasks
- [x] T1 (commit 4ea5cb1, ~167 changed lines src + ~270 new tests; route: delegated writer) Types + middlewares: add `holdingId` to `AuthenticatedUser`; `TenantContext` becomes a union `{empresaId}` | `{holdingId}` | `{unrestricted:true}`; own-JWT and gateway-trust middlewares load `usuario.holdingId` and reject holding sessions without it; `req.user.empresaId` stays null so callers are unaffected. Route: delegated writer. Trigger: 2+ non-trivial files.
- [x] T2 (commit 06f967c, 481+/10-; DEVIATION: additive permissive `holding_isolation` policy on 29 tables instead of rewriting `tenant_isolation`; route: delegated writer) GUC + migration: `applyTenantGucs` sets `app.tenant_holding_id`; new migration rewrites every `tenant_isolation` policy (DO block over `pg_policies`, preserving variant branches and WITH CHECK) adding `OR empresa_id IN (SELECT id FROM empresas WHERE holding_id = NULLIF(current_setting('app.tenant_holding_id',true),'')::uuid)`. Route: delegated writer.
- [x] T3 (subsumed by T1 commit 4ea5cb1: all `empresaId:null` job/webhook/OAuth call sites now `{unrestricted:true}`/runAsSystem; holding-wide report job carries a T5 TODO) System jobs: explicit `runAsSystem`/`{unrestricted:true}` for ingesta-inbox, bridgeApi poll, linkedin/meta-ads OAuth callbacks, meta-webhook. Route: delegated writer.
- [x] T4 (committed after 06f967c; ~250 changed lines incl. 13 new non-DB tests; writer-reported: 13/13 pass via scratch config, tsc clean on touched files, DB-backed empresa suites NOT run; scope arg defaults to unrestricted = fail-open for forgetful callers -> make it required in T5) `/empresas`: repo `findAll`/`findById` filter by holdingId, `create` sets holdingId, `GET/PUT /empresas/:id` return 404 outside the holding (SUPER_ADMIN exempt). Route: delegated writer.
- USER DECISION 2026-09-21: additive `holding_isolation` policy (T2) ACCEPTED; supersedes the earlier "rewrite policies" Decision B(a) (Engram #490). Unrestricted GUC stays only for SUPER_ADMIN and system jobs.
- [x] T5a DONE commit b96329d (~525 lines incl. tests; writer-reported: 43 non-DB tests pass; DB-backed suites NOT run; tsc only stale-Prisma-client errors)
- [x] T5b DONE commit cf0a9ff (393+/17-; writer-reported: 63 non-DB tests pass across 6 files; DB-backed NOT run). Open gaps reported: PATCH /configuracion-empresa + POST logo write a GLOBAL singleton row (cross-holding write; SUPER_ADMIN-only or per-holding?); scheduleMetricasBroadcast/CommittedEvent untagged => metrics refetch signals still cross holdings; PATCH rol to a holding-wide role does not set holdingId; delete/deactivate have no role ceiling; POST /bridges and /canales-manuales with a foreign empresaId give a DB error (WITH CHECK) instead of 404; SUPERVISOR_HOLDING can still create ADMINISTRADOR/SUPERVISOR (no full hierarchy).
- [x] T5c DONE commit b0b9e28 (~540 lines incl. migration 20260921160000, seeds, admin-prisma fixture, 15 non-DB tests pass; migration SQL, seeds and fixture extension NEVER executed; empresa fixtures creating their own empresas without holding may still fail on Postgres; 58 files use legacy admins -> user must run the DB suite)
- (T5c original spec:) T5c (USER-APPROVED before committing T5a: data migration linking legacy ADMINISTRADOR/SUPERVISOR to the holding of their empresas when unambiguous, failing loudly if ambiguous; seed creates a demo Holding and links demo empresas/users; shared DB-test helpers create/use a Holding so the ~47 legacy-admin test files keep working; `POST /usuarios` inherits the actor's holdingId; 403 stays fail-closed for anything unlinkable). T5a is implemented but UNCOMMITTED until T5c lands (T5a writer report: 43 non-DB tests pass; 47 DB-backed test files would 403; seeds/legacy users would be locked out).
- [ ] T5a (legacy own-JWT ADMINISTRADOR/SUPERVISOR holding scope, required EmpresaScope, holding check on usuarios `findById` at ~359/437/519) and T5b (audit of access services, SSE broker keys, report jobs) — split of T5 below.
- [ ] T5 (ACCEPTED USER DECISION: legacy own-JWT ADMINISTRADOR/SUPERVISOR holding-scope sessions must also be scoped to their holding — resolve `holdingId` for them in require-authentication instead of `{unrestricted:true}`; only SUPER_ADMIN and system jobs stay unrestricted) Access checks: validate `empresaId` query/path against the holding in leads/oportunidad/conversaciones/metricas/reportes/usuarios/bridge/canal-manual/notificaciones access services; scope SSE broker keys and report jobs to the holding. Route: delegated writer.
- [ ] T6 Tests: extend `rls-runtime-matrix` (holding A cannot see holding B; holding sees all its own; no context reads nothing; unrestricted sees all), `rls-policy-coverage`, `/empresas/:id` IDOR test.

- [x] T7 DONE (committed after cf0a9ff; ~85 changed lines; writer-reported: 46/46 non-DB tests pass in 3 usuarios files; non-SUPER_ADMIN body holdingId is IGNORED, not rejected; DB/route tests not run) (USER DECISION 2026-09-21) SUPER_ADMIN chooses the holding on `POST /usuarios` through a NEW request field `holdingId` (validated, must exist; ignored/rejected for non-SUPER_ADMIN actors who inherit their own holding). Route: delegated writer.
- [ ] T8 (NEW FEATURE requested by user, needs exploration + design decisions, likely its own feature doc/PR chain across Vimcore__CRM and Vimcore__Api_Auth) When the CRM creates a user, publish an event over Azure Service Bus (topic `vimcore-domain-events`) so Auth creates the user/identity; Auth stays the identity source of truth. Open design questions: event name/payload, Auth-side consumer + invitation vs direct creation, how `authUserId` is linked back to the CRM Usuario, failure/retry/idempotency.

## Authorized scope
Implementation of T1-T6 in `Vimcore__CRM/backend`, on a feature branch, with work-unit commits (Conventional Commits, no AI attribution). Push, PR and merge remain the user's decisions.

## Acceptance criteria
- A holding user's queries return only rows of empresas in their holding, at RLS level and in `/empresas`.
- `GET/PUT /empresas/:id` of another holding returns 404.
- Holding session without `holdingId` is rejected.
- System jobs and own-JWT SUPER_ADMIN still work unrestricted.
- Typecheck and non-DB unit tests pass; DB-backed suites pass on a throwaway Postgres (run by the user if the agent cannot).

## Risks
- Subquery on `empresas` per row (index `idx_empresas_holding` exists; consider STABLE SECURITY DEFINER).
- Legacy rows with `holding_id NULL` become invisible to holding users; check backfill `20260918200100`.
- Rewriting `membresias`/`usuarios` bootstrap policies could break login and bridge-key flows.
- Gateway path for SUPER_ADMIN unresolved (`identidad_no_vinculada`), out of scope.

## Progress
Exploration done (RLS/tenant-context map). Branch: `feat/holding-admin-gateway-auth` (only `odd/` untracked); a new feature branch is created before the first source write.

## Verification evidence
T1: writer-reported (parent did not re-run): tsc shows no errors introduced (repo-wide typecheck not clean: stale Prisma client + missing @azure modules, prisma generate EACCES); non-DB tests tenant-context, require-authentication.holding-scope, tenant-logger 15/15 pass via a scratch vitest config; DB-backed cases (RLS matrix, company-path gateway tests, dual-mode auth tests) NOT run. Parent readback: 29 files, 117+/50-, diff matches spec.
T2: writer-reported only. Static migration test 9/9 (scratch non-DB vitest config); test files typecheck. The migration SQL was NEVER executed and the new holding cases in tests/adversarial/rls-runtime-matrix.test.ts were NOT run (no Postgres available to the agent). USER MUST run the migration + matrix on a throwaway Postgres before merge. Risks: $p$/$mig$ quoting, pg_policies guard predicates, planner inlining, lock level.
Delivery note: T1 alone leaves holding sessions with no tenant rows until T2's policies exist, so T1+T2 must land in the same PR (separate commits).
Open decisions: legacy own-JWT ADMINISTRADOR/SUPERVISOR with holding scope still unrestricted (confirm); event-broker SSE keys are T5.

## Next step
NEXT: user must run migrations + DB-backed suites on a throwaway Postgres (T1-T5 verification is static/mocked only); pending user decisions: SUPER_ADMIN choosing a holding on POST /usuarios, configuracion-empresa global write. T6 remaining = DB-backed IDOR/route tests once Postgres is available. (Old note:) T5 via delegated writer after the user answers the pending question: keep the additive `holding_isolation` design (T2) or later do the earlier "rewrite policies" decision B(a) (Engram #490). T5 extras found by T4: usuarios.service.ts `findById` at ~359/437/519 (POST /empresas/:id/administradores|supervisores|asesores) has no holding check; configuracion-empresa.* not inspected. T1+T2 share the first PR.
