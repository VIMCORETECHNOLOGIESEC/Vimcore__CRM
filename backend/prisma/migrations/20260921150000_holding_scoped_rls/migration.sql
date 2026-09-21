-- holding-scoped-tenant-isolation (T2): holding-bound RLS scope.
--
-- Holding-scope users (ADMINISTRADOR_HOLDING / SUPERVISOR_HOLDING) used to run
-- with `app.tenant_unrestricted = 'on'`, which exposed the rows of EVERY holding.
-- They now run with `app.tenant_holding_id` (set by `lib/prisma.ts::applyTenantGucs`)
-- and must only see rows whose empresa belongs to that holding.
--
-- Design: each `tenant_isolation` policy stays EXACTLY as it is (unrestricted
-- branch, empresa branch, membresias/bridges bootstrap branches, notificaciones
-- and configuraciones_reporte NULL branches, bridge_logs orphan branch,
-- WITH CHECK clauses). This migration only ADDS one extra PERMISSIVE policy per
-- table, `holding_isolation`. Postgres ORs every permissive policy, for USING
-- and for WITH CHECK alike, so the holding scope is strictly additive:
--   * unrestricted sessions        -> unchanged
--   * empresa-scoped sessions      -> unchanged
--   * no tenant context            -> still fail-closed (empty GUC -> NULL -> no match)
-- No policy text is parsed or regenerated from `pg_policies` (its deparsed form
-- cannot be verified without a live database), so no existing policy is weakened
-- by a rewrite mistake.
--
-- `empresas`, `usuarios` and `holdings` are identity tables without RLS and stay
-- that way: the helper below reads `empresas` without recursion, and app-level
-- filtering of `/empresas` belongs to a later task.

-- ============================================================
-- 1. Helper: the empresa ids of the holding bound to this session
-- ============================================================
--
-- NULLIF(..., '')::uuid, not a bare cast: pooled connections that set the GUC once
-- return '' (not NULL) on later transactions that never call set_config, and
-- ''::uuid raises "invalid input syntax for type uuid". With NULL the comparison
-- `holding_id = NULL` matches nothing, so an unbound session gets an empty set.
--
-- LANGUAGE sql + STABLE + SECURITY INVOKER (default): the planner can inline it
-- and the uncorrelated subselect is evaluated once per statement, not per row.
-- `crm_app` already has SELECT on `empresas` (GRANT ... ON ALL TABLES in
-- 20260827100000_rls_tenant_isolation) and `empresas` has no RLS, so the
-- function cannot recurse into a policy.
CREATE OR REPLACE FUNCTION public.app_holding_empresa_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $fn$
  SELECT e."id"
  FROM public."empresas" e
  WHERE e."holding_id" = NULLIF(current_setting('app.tenant_holding_id', true), '')::uuid
$fn$;

REVOKE ALL ON FUNCTION public.app_holding_empresa_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_holding_empresa_ids() TO "crm_app";
GRANT EXECUTE ON FUNCTION public.app_holding_empresa_ids() TO "crm_bypass_jobs";

-- ============================================================
-- 2. holding_isolation policy for every table that has tenant_isolation
-- ============================================================
--
-- Fails loudly (RAISE EXCEPTION, aborting the whole migration) when:
--   * a `tenant_isolation` policy exists on a table this migration does not know
--     (it would silently stay invisible to holding sessions);
--   * a listed table lacks RLS enabled+forced or its `tenant_isolation` policy;
--   * a `tenant_isolation` policy is not PERMISSIVE / FOR ALL / TO PUBLIC or does
--     not contain the unrestricted branch (a shape this migration was not
--     written against).
-- Idempotent: an existing `holding_isolation` is dropped and recreated.
DO $mig$
DECLARE
  v_in        CONSTANT text := 'IN (SELECT h FROM public.app_holding_empresa_ids() AS h)';
  -- {table, tenant column}: tables whose tenant column is on the row itself.
  v_direct    CONSTANT text[] := ARRAY[
    'leads', 'empresa_id',
    'membresias', 'empresa_id',
    'bridges', 'empresa_id',
    'citas', 'empresa_id',
    'lead_eventos', 'empresa_id',
    'notificaciones', 'empresa_id',
    'bridge_logs', 'empresa_id',
    'configuraciones_reporte', 'empresa_id',
    'cuentas_anuncios_conexiones', 'empresa_id',
    'cuentas_anuncios_oauth_states', 'empresa_id',
    'oportunidades', 'empresa_id',
    'oportunidad_eventos', 'empresa_id',
    'productos', 'empresa_id',
    'canales_manuales', 'empresa_id',
    'clientes', 'empresa_id',
    'conversaciones_lectura_whatsapp', 'empresa_id',
    'conversaciones_whatsapp', 'empresa_id',
    'conversaciones_whatsapp_eventos', 'empresa_id',
    -- Tenant column is NOT `empresa_id` here (the ingest empresa scopes the row).
    'leads_abiertos_revision_pendiente', 'empresa_ingesta_id'
  ];
  -- {table, predicate}: tables scoped through a parent chain (mirrors each
  -- existing EXISTS policy; `{IN}` expands to the holding subselect).
  v_indirect  CONSTANT text[] := ARRAY[
    'respuestas_formulario',
    $p$EXISTS (
      SELECT 1 FROM "leads" l
      WHERE l."id" = "respuestas_formulario"."lead_id"
        AND l."empresa_id" {IN}
    )$p$,
    'leads_recibidos',
    $p$EXISTS (
      SELECT 1 FROM "bridges" b
      WHERE b."id" = "leads_recibidos"."bridge_id"
        AND b."empresa_id" {IN}
    )$p$,
    'cuentas_publicitarias',
    $p$EXISTS (
      SELECT 1 FROM "bridges" b
      WHERE b."id" = "cuentas_publicitarias"."bridge_id"
        AND b."empresa_id" {IN}
    )$p$,
    'campanias',
    $p$EXISTS (
      SELECT 1 FROM "cuentas_publicitarias" cp
      JOIN "bridges" b ON b."id" = cp."bridge_id"
      WHERE cp."id" = "campanias"."cuenta_publicitaria_id"
        AND b."empresa_id" {IN}
    )
    OR EXISTS (
      SELECT 1 FROM "cuentas_anuncios_conexiones" cac
      WHERE cac."id" = "campanias"."cuenta_anuncios_conexion_id"
        AND cac."empresa_id" {IN}
    )$p$,
    'campania_metricas_diarias',
    $p$EXISTS (
      SELECT 1 FROM "campanias" c
      LEFT JOIN "cuentas_publicitarias" cp ON cp."id" = c."cuenta_publicitaria_id"
      LEFT JOIN "bridges" b ON b."id" = cp."bridge_id"
      LEFT JOIN "cuentas_anuncios_conexiones" cac ON cac."id" = c."cuenta_anuncios_conexion_id"
      WHERE c."id" = "campania_metricas_diarias"."campania_id"
        AND (
          b."empresa_id" {IN}
          OR cac."empresa_id" {IN}
        )
    )$p$,
    'linkedin_conexiones',
    $p$EXISTS (
      SELECT 1 FROM "bridges" b
      WHERE b."id" = "linkedin_conexiones"."bridge_id"
        AND b."empresa_id" {IN}
    )$p$,
    'linkedin_oauth_states',
    $p$EXISTS (
      SELECT 1 FROM "bridges" b
      WHERE b."id" = "linkedin_oauth_states"."bridge_id"
        AND b."empresa_id" {IN}
    )$p$,
    'linkedin_fuentes',
    $p$EXISTS (
      SELECT 1
      FROM "linkedin_conexiones" lc
      JOIN "bridges" b ON b."id" = lc."bridge_id"
      WHERE lc."id" = "linkedin_fuentes"."conexion_id"
        AND b."empresa_id" {IN}
    )$p$,
    'linkedin_formularios',
    $p$EXISTS (
      SELECT 1
      FROM "linkedin_fuentes" lf
      JOIN "linkedin_conexiones" lc ON lc."id" = lf."conexion_id"
      JOIN "bridges" b ON b."id" = lc."bridge_id"
      WHERE lf."id" = "linkedin_formularios"."fuente_id"
        AND b."empresa_id" {IN}
    )$p$,
    'mensajes_whatsapp',
    $p$EXISTS (
      SELECT 1 FROM "conversaciones_whatsapp" c
      WHERE c."id" = "mensajes_whatsapp"."conversacion_id"
        AND c."empresa_id" {IN}
    )$p$
  ];
  v_tables    text[] := ARRAY[]::text[];
  v_preds     text[] := ARRAY[]::text[];
  v_i         int;
  v_tbl       text;
  v_pred      text;
  v_bad       text;
  v_n_expected int;
  v_n_actual  bigint;
BEGIN
  -- Flatten both specs into (table, predicate) pairs.
  FOR v_i IN 1 .. array_length(v_direct, 1) BY 2 LOOP
    v_tables := v_tables || v_direct[v_i];
    v_preds  := v_preds  || format('%I %s', v_direct[v_i + 1], v_in);
  END LOOP;
  FOR v_i IN 1 .. array_length(v_indirect, 1) BY 2 LOOP
    v_tables := v_tables || v_indirect[v_i];
    v_preds  := v_preds  || replace(v_indirect[v_i + 1], '{IN}', v_in);
  END LOOP;
  v_n_expected := array_length(v_tables, 1);

  IF v_n_expected <> (SELECT count(DISTINCT t) FROM unnest(v_tables) AS t) THEN
    RAISE EXCEPTION 'holding_scoped_rls: duplicate table in the migration spec';
  END IF;

  -- Guard 1: no tenant_isolation policy may exist outside the spec.
  SELECT string_agg(p.tablename, ', ' ORDER BY p.tablename) INTO v_bad
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.policyname = 'tenant_isolation'
    AND NOT (p.tablename = ANY (v_tables));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'holding_scoped_rls: tenant_isolation policy on table(s) not covered by this migration: %', v_bad;
  END IF;

  -- Guard 2: every spec table has RLS enabled+forced and a tenant_isolation
  -- policy of the shape this migration understands.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_tbl
        AND c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'holding_scoped_rls: table % is missing or lacks ENABLE+FORCE ROW LEVEL SECURITY', v_tbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = v_tbl
        AND p.policyname = 'tenant_isolation'
        AND p.cmd = 'ALL'
        AND p.permissive = 'PERMISSIVE'
        AND p.roles = ARRAY['public']::name[]
        AND position('app.tenant_unrestricted' IN p.qual) > 0
        AND p.with_check IS NOT NULL
        AND position('app.tenant_unrestricted' IN p.with_check) > 0
    ) THEN
      RAISE EXCEPTION 'holding_scoped_rls: table % has no tenant_isolation policy of the expected shape (PERMISSIVE, FOR ALL, TO PUBLIC, USING and WITH CHECK with the unrestricted branch)', v_tbl;
    END IF;
  END LOOP;

  -- Create (or recreate) the additive holding policy. USING and WITH CHECK share
  -- the same predicate so a holding session cannot INSERT/UPDATE a row into an
  -- empresa of another holding.
  FOR v_i IN 1 .. v_n_expected LOOP
    v_tbl  := v_tables[v_i];
    v_pred := v_preds[v_i];
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'holding_isolation', v_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO PUBLIC USING (%s) WITH CHECK (%s)',
      'holding_isolation', v_tbl, v_pred, v_pred
    );
  END LOOP;

  -- Post-condition: one holding_isolation per tenant_isolation, nothing else moved.
  SELECT count(*) INTO v_n_actual
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.policyname = 'holding_isolation';
  IF v_n_actual <> v_n_expected THEN
    RAISE EXCEPTION 'holding_scoped_rls: expected % holding_isolation policies, found %', v_n_expected, v_n_actual;
  END IF;

  SELECT count(*) INTO v_n_actual
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.policyname = 'tenant_isolation';
  IF v_n_actual <> v_n_expected THEN
    RAISE EXCEPTION 'holding_scoped_rls: expected % tenant_isolation policies, found %', v_n_expected, v_n_actual;
  END IF;
END
$mig$;
