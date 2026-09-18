-- Cliente becomes tenant-scoped (closes the "Cliente is holding-shared" model
-- of D2, docs/16-hallazgos-y-preguntas.md):
--   1. `clientes.empresa_id` (direct column, not derived through `leads`, to
--      avoid the Lead -> Cliente -> Lead circularity).
--   2. Identity per empresa: UNIQUE (empresa_id, telefono_normalizado)
--      replaces the global UNIQUE (telefono_normalizado).
--   3. Backfill written for real production data (see step 2 below).
--   4. RLS on `clientes`, same policy shape as the other tenant tables
--      (20260901192829_whatsapp_rls_tenant_isolation).
--
-- Everything below runs inside the single implicit transaction Prisma opens
-- for a migration script: any RAISE EXCEPTION rolls the whole migration back,
-- leaving the schema and the data exactly as they were.

-- ============================================================
-- 1. Nullable column + write lock
-- ============================================================

-- Writers to the tables the backfill reads/repoints are blocked (reads stay
-- allowed) so the empresa map built below cannot go stale mid-migration.
LOCK TABLE "clientes", "leads", "conversaciones_whatsapp", "correos_cliente",
  "leads_abiertos_revision_pendiente" IN SHARE ROW EXCLUSIVE MODE;

-- `leads` and `conversaciones_whatsapp` already have FORCE ROW LEVEL SECURITY.
-- A non-superuser migration role without BYPASSRLS would otherwise see zero
-- rows through their policies and the repoint UPDATEs would silently touch
-- nothing (the post-backfill assertions would then abort the migration).
-- Transaction-local, same GUC the holding-wide application context uses.
SELECT set_config('app.tenant_unrestricted', 'on', true);

ALTER TABLE "clientes" ADD COLUMN "empresa_id" UUID;

-- The global unique index has to go BEFORE the clone step below: a Cliente
-- shared by two empresas is cloned with the SAME telefono_normalizado. The
-- composite unique that replaces it is added only after the backfill, so the
-- final constraint is validated against the fully repartitioned data.
DROP INDEX "clientes_telefono_normalizado_key";

-- ============================================================
-- 2. Backfill
-- ============================================================
--
-- A Cliente's empresas are the DISTINCT set of leads.empresa_id UNION
-- conversaciones_whatsapp.empresa_id (both NOT NULL):
--   * exactly one empresa   -> the Cliente is assigned to it directly;
--   * two or more empresas  -> the ORIGINAL Cliente stays with the lowest
--     empresa_id (deterministic) and one CLONE per extra empresa is created;
--     each Lead / Conversacion is repointed to the Cliente of its own
--     empresa, CorreoCliente rows are copied to every clone (a correo has no
--     empresa of its own, so it cannot be attributed to just one side), and
--     LeadAbiertoRevisionPendiente follows its lead;
--   * no leads and no conversaciones (orphan) -> see the orphan handling.

CREATE TEMP TABLE "_cliente_empresa_map" (
  "cliente_id"       UUID NOT NULL,
  "empresa_id"       UUID NOT NULL,
  "nuevo_cliente_id" UUID,
  PRIMARY KEY ("cliente_id", "empresa_id")
);

INSERT INTO "_cliente_empresa_map" ("cliente_id", "empresa_id")
SELECT "cliente_id", "empresa_id" FROM "leads"
UNION
SELECT "cliente_id", "empresa_id" FROM "conversaciones_whatsapp";

-- Lowest empresa_id keeps the original Cliente id; every other pair gets a
-- fresh id for its clone.
UPDATE "_cliente_empresa_map" m
SET "nuevo_cliente_id" = CASE
  WHEN r."rn" = 1 THEN m."cliente_id"
  ELSE gen_random_uuid()
END
FROM (
  SELECT "cliente_id", "empresa_id",
         ROW_NUMBER() OVER (PARTITION BY "cliente_id" ORDER BY "empresa_id") AS "rn"
  FROM "_cliente_empresa_map"
) r
WHERE r."cliente_id" = m."cliente_id" AND r."empresa_id" = m."empresa_id";

-- Originals: assigned to their (lowest) empresa.
UPDATE "clientes" c
SET "empresa_id" = m."empresa_id"
FROM "_cliente_empresa_map" m
WHERE m."cliente_id" = c."id" AND m."nuevo_cliente_id" = c."id";

-- Clones: one per extra empresa, same identity data.
INSERT INTO "clientes" ("id", "empresa_id", "nombre", "telefono_original",
                        "telefono_normalizado", "telefono_valido", "creado_en")
SELECT m."nuevo_cliente_id", m."empresa_id", c."nombre", c."telefono_original",
       c."telefono_normalizado", c."telefono_valido", c."creado_en"
FROM "_cliente_empresa_map" m
JOIN "clientes" c ON c."id" = m."cliente_id"
WHERE m."nuevo_cliente_id" <> m."cliente_id";

-- Copy correos to every clone (the original keeps all of its own).
INSERT INTO "correos_cliente" ("id", "cliente_id", "correo", "correo_normalizado", "es_principal")
SELECT gen_random_uuid(), m."nuevo_cliente_id", cc."correo", cc."correo_normalizado", cc."es_principal"
FROM "_cliente_empresa_map" m
JOIN "correos_cliente" cc ON cc."cliente_id" = m."cliente_id"
WHERE m."nuevo_cliente_id" <> m."cliente_id";

-- Repoint Lead / Conversacion to the Cliente of their own empresa.
UPDATE "leads" l
SET "cliente_id" = m."nuevo_cliente_id"
FROM "_cliente_empresa_map" m
WHERE m."cliente_id" = l."cliente_id"
  AND m."empresa_id" = l."empresa_id"
  AND m."nuevo_cliente_id" <> l."cliente_id";

UPDATE "conversaciones_whatsapp" cv
SET "cliente_id" = m."nuevo_cliente_id"
FROM "_cliente_empresa_map" m
WHERE m."cliente_id" = cv."cliente_id"
  AND m."empresa_id" = cv."empresa_id"
  AND m."nuevo_cliente_id" <> cv."cliente_id";

-- LeadAbiertoRevisionPendiente follows the Cliente of its (already
-- repointed) open lead. Empty in production at the time of writing.
UPDATE "leads_abiertos_revision_pendiente" p
SET "cliente_id" = l."cliente_id"
FROM "leads" l
WHERE l."id" = p."lead_abierto_id" AND p."cliente_id" <> l."cliente_id";

-- Orphans: Clientes with no lead and no conversation have no empresa to infer.
-- Never deleted and never guessed. They are resolved only when the answer is
-- unambiguous (the holding has exactly ONE empresa, so there is only one
-- tenant they can belong to); otherwise the migration aborts loudly and rolls
-- back so a human decides (delete the orphan rows, or link them to a lead or
-- conversation of the right empresa) before re-running.
DO $$
DECLARE
  v_orphans  BIGINT;
  v_empresas BIGINT;
  v_unica_empresa UUID;
BEGIN
  SELECT count(*) INTO v_orphans FROM "clientes" WHERE "empresa_id" IS NULL;
  IF v_orphans > 0 THEN
    SELECT count(*) INTO v_empresas FROM "empresas";
    IF v_empresas = 1 THEN
      SELECT "id" INTO v_unica_empresa FROM "empresas";
      UPDATE "clientes" SET "empresa_id" = v_unica_empresa WHERE "empresa_id" IS NULL;
      RAISE NOTICE 'cliente_empresa_tenant_isolation: % orphan Cliente(s) (no lead, no conversation) assigned to the only empresa %',
        v_orphans, v_unica_empresa;
    ELSE
      RAISE EXCEPTION 'cliente_empresa_tenant_isolation: % Cliente row(s) have no Lead and no Conversacion and there are % empresas, so their empresa cannot be inferred. Delete them or link them to a lead/conversation of the right empresa, then re-run the migration. Sample ids: %',
        v_orphans, v_empresas,
        (SELECT string_agg("id"::text, ', ') FROM (SELECT "id" FROM "clientes" WHERE "empresa_id" IS NULL ORDER BY "id" LIMIT 10) s);
    END IF;
  END IF;
END
$$;

-- Post-backfill assertions.
DO $$
DECLARE
  v_n BIGINT;
BEGIN
  SELECT count(*) INTO v_n FROM "clientes" WHERE "empresa_id" IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'cliente_empresa_tenant_isolation: % Cliente row(s) still have NULL empresa_id after backfill', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM "leads" l
    JOIN "clientes" c ON c."id" = l."cliente_id" WHERE c."empresa_id" <> l."empresa_id";
  IF v_n > 0 THEN
    RAISE EXCEPTION 'cliente_empresa_tenant_isolation: % Lead row(s) point to a Cliente of a different empresa', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM "conversaciones_whatsapp" cv
    JOIN "clientes" c ON c."id" = cv."cliente_id" WHERE c."empresa_id" <> cv."empresa_id";
  IF v_n > 0 THEN
    RAISE EXCEPTION 'cliente_empresa_tenant_isolation: % Conversacion row(s) point to a Cliente of a different empresa', v_n;
  END IF;

  -- CorreoCliente carries no empresa of its own: every clone must hold the
  -- same set of correos as the Cliente it was cloned from.
  SELECT count(*) INTO v_n FROM (
    SELECT m."nuevo_cliente_id", cc."correo_normalizado"
    FROM "_cliente_empresa_map" m
    JOIN "correos_cliente" cc ON cc."cliente_id" = m."cliente_id"
    WHERE m."nuevo_cliente_id" <> m."cliente_id"
    EXCEPT
    SELECT "cliente_id", "correo_normalizado" FROM "correos_cliente"
  ) missing;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'cliente_empresa_tenant_isolation: % correo(s) were not copied to their cloned Cliente', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM "leads_abiertos_revision_pendiente" p
    JOIN "leads" l ON l."id" = p."lead_abierto_id" WHERE p."cliente_id" <> l."cliente_id";
  IF v_n > 0 THEN
    RAISE EXCEPTION 'cliente_empresa_tenant_isolation: % LeadAbiertoRevisionPendiente row(s) point to a Cliente other than their lead''s', v_n;
  END IF;
END
$$;

DROP TABLE "_cliente_empresa_map";

-- ============================================================
-- 3. Constraints (only after the backfill)
-- ============================================================

ALTER TABLE "clientes" ALTER COLUMN "empresa_id" SET NOT NULL;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "clientes_empresa_id_telefono_normalizado_key"
  ON "clientes"("empresa_id", "telefono_normalizado");
CREATE INDEX "idx_clientes_empresa" ON "clientes"("empresa_id");

-- ============================================================
-- 4. RLS (same shape as conversaciones_whatsapp)
-- ============================================================
--
-- No GRANT to add: `crm_app` already has SELECT/INSERT/UPDATE/DELETE on every
-- table through the `ALTER DEFAULT PRIVILEGES` / `GRANT ... ON ALL TABLES` of
-- 20260827100000_rls_tenant_isolation, and `crm_bypass_jobs` keeps its
-- `GRANT SELECT ON "clientes"` (BYPASSRLS skips the policy, not the GRANT).
-- Holding-wide access uses the same `app.tenant_unrestricted = 'on'` branch as
-- every other tenant policy; no holding-specific GUC exists.

ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clientes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "clientes"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);
