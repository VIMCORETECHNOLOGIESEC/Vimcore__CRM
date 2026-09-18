-- holding-admin-gateway-auth: backfill of the explicit holding scope.
--
-- Holding scope used to mean "Usuario with rol ADMINISTRADOR and NO Membresia".
-- It becomes the explicit role ADMINISTRADOR_HOLDING + `usuarios.holding_id`.
--
-- Users affected:
--   * rol ADMINISTRADOR with no Membresia row at all (active or not) become
--     ADMINISTRADOR_HOLDING;
--   * rol SUPERVISOR_HOLDING keeps its role and only gets `holding_id`.
-- SUPER_ADMIN is platform-wide and is never linked to a holding.
--
-- Holding resolution (never guesses; aborts loudly when ambiguous):
--   * exactly one row in `holdings`  -> use it;
--   * none, but affected users or empresas exist -> create one default holding
--     (named after `configuracion_empresa`, else 'Default holding');
--   * several -> the affected users are linked only when exactly one holding
--     owns empresas; otherwise RAISE EXCEPTION listing sample ids.
-- Empresas without `holding_id` are linked to the resolved holding when it is
-- unambiguous. `empresas.holding_id` stays NULLABLE (no constraint is tightened).
DO $$
DECLARE
  v_holding_id  UUID;
  v_holdings    INT;
  v_users       INT;
  v_empresas    INT;
  v_owning      UUID[];
  v_sample      TEXT;
  v_left        INT;
BEGIN
  SELECT count(*) INTO v_users FROM "usuarios" u
   WHERE u."rol" = 'SUPERVISOR_HOLDING'
      OR (u."rol" = 'ADMINISTRADOR'
          AND NOT EXISTS (SELECT 1 FROM "membresias" m WHERE m."usuario_id" = u."id"));
  SELECT count(*) INTO v_empresas FROM "empresas";
  SELECT count(*) INTO v_holdings FROM "holdings";

  IF v_holdings = 1 THEN
    SELECT "id" INTO v_holding_id FROM "holdings";
  ELSIF v_holdings = 0 THEN
    IF v_users > 0 OR v_empresas > 0 THEN
      INSERT INTO "holdings" ("id", "nombre")
      VALUES (
        gen_random_uuid(),
        COALESCE(
          (SELECT NULLIF(btrim("nombre"), '') FROM "configuracion_empresa"
            ORDER BY "actualizado_en" DESC LIMIT 1),
          'Default holding'
        )
      )
      RETURNING "id" INTO v_holding_id;
    END IF;
  ELSE
    -- Several holdings: only holdings that already own empresas are candidates.
    SELECT array_agg(DISTINCT "holding_id") INTO v_owning
      FROM "empresas" WHERE "holding_id" IS NOT NULL;
    IF v_owning IS NOT NULL AND array_length(v_owning, 1) = 1 THEN
      v_holding_id := v_owning[1];
    ELSIF v_users > 0 THEN
      SELECT string_agg(s."id"::text, ', ') INTO v_sample FROM (
        SELECT u."id" FROM "usuarios" u
         WHERE u."rol" = 'SUPERVISOR_HOLDING'
            OR (u."rol" = 'ADMINISTRADOR'
                AND NOT EXISTS (SELECT 1 FROM "membresias" m WHERE m."usuario_id" = u."id"))
         ORDER BY u."id" LIMIT 5
      ) s;
      RAISE EXCEPTION
        'holding backfill aborted: % holdings exist and % holding-scoped user(s) cannot be linked unambiguously (sample user ids: %). Link them manually (usuarios.holding_id) and re-run.',
        v_holdings, v_users, v_sample;
    END IF;
  END IF;

  IF v_holding_id IS NOT NULL THEN
    UPDATE "empresas" SET "holding_id" = v_holding_id WHERE "holding_id" IS NULL;

    UPDATE "usuarios" u
       SET "rol" = 'ADMINISTRADOR_HOLDING', "holding_id" = v_holding_id
     WHERE u."rol" = 'ADMINISTRADOR'
       AND NOT EXISTS (SELECT 1 FROM "membresias" m WHERE m."usuario_id" = u."id");

    UPDATE "usuarios" SET "holding_id" = v_holding_id
     WHERE "rol" = 'SUPERVISOR_HOLDING' AND "holding_id" IS NULL;
  END IF;

  -- Assertions: nothing holding-scoped may be left without a holding.
  SELECT count(*) INTO v_left FROM "usuarios"
   WHERE "rol" IN ('ADMINISTRADOR_HOLDING', 'SUPERVISOR_HOLDING') AND "holding_id" IS NULL;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'holding backfill assertion failed: % holding-scoped user(s) without holding_id', v_left;
  END IF;

  SELECT count(*) INTO v_left FROM "usuarios" u
   WHERE u."rol" = 'ADMINISTRADOR'
     AND NOT EXISTS (SELECT 1 FROM "membresias" m WHERE m."usuario_id" = u."id");
  IF v_left > 0 THEN
    RAISE EXCEPTION 'holding backfill assertion failed: % ADMINISTRADOR user(s) without Membresia remain', v_left;
  END IF;
END
$$;
