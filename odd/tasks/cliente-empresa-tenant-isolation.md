# Feature: cliente-empresa-tenant-isolation

Make `Cliente` tenant-scoped so one empresa never shares a client (or its messages) with another.

Decision (closed): direct `Cliente.empresaId` (NOT NULL, FK Empresa), composite unique
`[empresaId, telefonoNormalizado]`, new RLS on `clientes`, empresa-scoped dedupe, and a backfill that
splits shared Clientes using `Lead.empresaId ∪ Conversacion.empresaId`.

Branch: `feat/cliente-empresa-tenant-isolation`

## Tasks

- [x] T1. Schema, backfill/split migration, RLS, empresa-scoped dedupe and tests (atomic: the schema change breaks the old code paths, so they cannot land separately)
  - Evidence: `tsc --noEmit` clean (observed); full backend `vitest run` 145 files / 1578 tests green (reported by the writer), then re-run independently by a fresh worker on a throwaway Postgres 16 from a copy of the repo: 145/145 files, 1578/1578 tests, `tsc` clean (one file needs `CRM_GATEWAY_SECRET` set in the env)
  - Commit: a32ef9d
- [x] T2. Docs: mark the "clientes" decision as superseded in `docs/16-hallazgos-y-preguntas.md`
  - Commit: 61b3591

## Follow-ups (not in this feature's commits)

- Orphan Clientes (no Lead and no Conversacion): the migration aborts when there is more than one empresa. Run the orphan count query on production before deploying.
- `correos_cliente` has no RLS and every clone carries a copy of the correos; add an EXISTS-style policy like `mensajes_whatsapp`.
- `backend/prisma/seed-leads-qa.ts` was already stale (creates lack `empresaId`).
- Backfill was only exercised with synthetic data.
- `backend/prisma/migrations/20260916175645_holding_tenant_table/` is untracked and unrelated to this feature; it is intentionally left out of these commits.
