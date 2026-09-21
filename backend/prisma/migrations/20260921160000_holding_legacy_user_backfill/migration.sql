-- holding-scoped-tenant-isolation (T5c): link legacy holding-wide users to a holding.
--
-- Own-JWT sessions of the legacy roles ADMINISTRADOR / SUPERVISOR are holding
-- sessions (no `empresaId`) and, since T5a, are confined to `usuarios.holding_id`
-- (403 `identidad_no_vinculada` when NULL). Only ADMINISTRADOR without a
-- membresia and SUPERVISOR_HOLDING were linked by 20260918200100; every other
-- legacy ADMINISTRADOR/SUPERVISOR (with a membresia, or created afterwards by
-- POST /usuarios) still has holding_id NULL and would be locked out.
--
-- Rule (never guesses):
--   * A user with `holding_id IS NULL` and rol ADMINISTRADOR or SUPERVISOR is
--     linked to the holding of the empresas of its membresias when exactly ONE
--     distinct non-null `empresas.holding_id` is reachable.
--   * AMBIGUOUS (more than one distinct holding): RAISE EXCEPTION listing the
--     count and sample ids, aborting the whole migration. Picking one would grant
--     or deny access to the wrong tenant; an operator must decide.
--   * UNRESOLVABLE (no membresia, or only membresias of empresas without a
--     holding): RAISE NOTICE only. They stay NULL and therefore remain locked
--     out (fail-closed, same as the T5a middleware); linking them is a manual
--     decision (`UPDATE usuarios SET holding_id = ...`).
-- Idempotent: only rows with `holding_id IS NULL` are touched; a re-run links
-- nothing new. Empresas are never modified and no RLS policy is touched.
--
-- `membresias` has FORCE ROW LEVEL SECURITY (`usuarios`/`empresas` have none), so
-- a migration role without BYPASSRLS would read zero rows and silently link
-- nothing. Same transaction-local GUC as 20260918120000.
SELECT set_config('app.tenant_unrestricted', 'on', true);

DO $$
DECLARE
  v_ambiguous INT;
  v_sample    TEXT;
  v_linked    INT;
  v_unlinked  INT;
BEGIN
  SELECT count(*), string_agg(a."id"::text, ', ' ORDER BY a."id") FILTER (WHERE a."rn" <= 5)
    INTO v_ambiguous, v_sample
    FROM (
      SELECT u."id", row_number() OVER (ORDER BY u."id") AS "rn"
        FROM "usuarios" u
        JOIN "membresias" m ON m."usuario_id" = u."id"
        JOIN "empresas" e ON e."id" = m."empresa_id"
       WHERE u."rol" IN ('ADMINISTRADOR', 'SUPERVISOR')
         AND u."holding_id" IS NULL
         AND e."holding_id" IS NOT NULL
       GROUP BY u."id"
      HAVING count(DISTINCT e."holding_id") > 1
    ) a;

  IF v_ambiguous > 0 THEN
    RAISE EXCEPTION
      'legacy user holding backfill aborted: % ADMINISTRADOR/SUPERVISOR user(s) belong to empresas of more than one holding (sample user ids: %). Set usuarios.holding_id manually for them and re-run.',
      v_ambiguous, v_sample;
  END IF;

  UPDATE "usuarios" u
     SET "holding_id" = r."holding_id"
    FROM (
      SELECT m."usuario_id", min(e."holding_id"::text)::uuid AS "holding_id"
        FROM "membresias" m
        JOIN "empresas" e ON e."id" = m."empresa_id"
       WHERE e."holding_id" IS NOT NULL
       GROUP BY m."usuario_id"
      HAVING count(DISTINCT e."holding_id") = 1
    ) r
   WHERE r."usuario_id" = u."id"
     AND u."rol" IN ('ADMINISTRADOR', 'SUPERVISOR')
     AND u."holding_id" IS NULL;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  SELECT count(*), string_agg(s."id"::text, ', ' ORDER BY s."id") FILTER (WHERE s."rn" <= 5)
    INTO v_unlinked, v_sample
    FROM (
      SELECT u."id", row_number() OVER (ORDER BY u."id") AS "rn"
        FROM "usuarios" u
       WHERE u."rol" IN ('ADMINISTRADOR', 'SUPERVISOR') AND u."holding_id" IS NULL
    ) s;

  RAISE NOTICE 'legacy user holding backfill: % user(s) linked, % left without holding (locked out until linked manually; sample ids: %)',
    v_linked, v_unlinked, COALESCE(v_sample, 'none');
END
$$;
