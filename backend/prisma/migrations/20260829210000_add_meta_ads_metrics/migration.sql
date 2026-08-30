-- Meta Ads (Bloque E): conexión OAuth a cuentas de anuncios `act_<id>`,
-- catálogo de campañas publicitarias y métricas diarias reales desde Insights.
-- Nueva migración posterior a reportes: no se pliega en 20260829200000.

-- CreateEnum
CREATE TYPE "estado_conexion_cuenta_anuncios" AS ENUM ('ACTIVA', 'TOKEN_EXPIRADO', 'ERROR', 'INACTIVA');

-- CreateTable
CREATE TABLE "cuentas_anuncios_conexiones" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "autorizado_por_usuario_id" UUID NOT NULL,
    "cuenta_anuncios_id_externo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "moneda" TEXT,
    "zona_horaria" TEXT,
    "token_cifrado" TEXT,
    "token_expira_en" TIMESTAMPTZ(6),
    "estado" "estado_conexion_cuenta_anuncios" NOT NULL DEFAULT 'INACTIVA',
    "ultima_sincronizacion_en" TIMESTAMPTZ(6),
    "ultimo_error" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cuentas_anuncios_conexiones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cuentas_anuncios_oauth_states" (
    "id" UUID NOT NULL,
    "state_hash" TEXT NOT NULL,
    "empresa_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "usado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_anuncios_oauth_states_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Campania puede pertenecer a una Page legacy o a una conexión act_<id>, nunca a ambas.
DROP INDEX IF EXISTS "campanias_cuenta_publicitaria_id_id_externo_key";
ALTER TABLE "campanias" DROP CONSTRAINT IF EXISTS "campanias_cuenta_publicitaria_id_fkey";
ALTER TABLE "campanias" ALTER COLUMN "cuenta_publicitaria_id" DROP NOT NULL;
ALTER TABLE "campanias" ADD COLUMN "cuenta_anuncios_conexion_id" UUID;
ALTER TABLE "campanias" ADD CONSTRAINT "campanias_exactly_one_owner_check"
  CHECK (("cuenta_publicitaria_id" IS NOT NULL) <> ("cuenta_anuncios_conexion_id" IS NOT NULL));

CREATE TABLE "campania_metricas_diarias" (
    "id" UUID NOT NULL,
    "campania_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "red_social" "red_social" NOT NULL,
    "gasto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impresiones" INTEGER NOT NULL DEFAULT 0,
    "clics" INTEGER NOT NULL DEFAULT 0,
    "alcance" INTEGER NOT NULL DEFAULT 0,
    "moneda" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campania_metricas_diarias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_anuncios_conexiones_empresa_id_key" ON "cuentas_anuncios_conexiones"("empresa_id");
CREATE UNIQUE INDEX "cuentas_anuncios_conexiones_empresa_act_key" ON "cuentas_anuncios_conexiones"("empresa_id", "cuenta_anuncios_id_externo");
CREATE INDEX "idx_cuentas_anuncios_conexiones_act" ON "cuentas_anuncios_conexiones"("cuenta_anuncios_id_externo");
CREATE INDEX "idx_cuentas_anuncios_conexiones_sync" ON "cuentas_anuncios_conexiones"("estado", "ultima_sincronizacion_en");
CREATE UNIQUE INDEX "cuentas_anuncios_oauth_states_state_hash_key" ON "cuentas_anuncios_oauth_states"("state_hash");
CREATE INDEX "idx_cuentas_anuncios_oauth_states_expira" ON "cuentas_anuncios_oauth_states"("expira_en");
CREATE INDEX "idx_cuentas_anuncios_oauth_states_empresa_usuario" ON "cuentas_anuncios_oauth_states"("empresa_id", "usuario_id");

-- Planos, sin WHERE parcial: el CHECK "exactly one owner" de arriba ya
-- garantiza que solo una de las dos FK es NOT NULL por fila, y Postgres
-- trata NULL como distinto en un indice unico normal -- una fila con
-- cuenta_publicitaria_id NULL nunca choca con otra por esa columna. Sin
-- WHERE, esto coincide exactamente con @@unique([...]) en schema.prisma
-- (que no soporta indices parciales), evitando drift entre ambos.
CREATE UNIQUE INDEX "campanias_cuenta_publicitaria_id_id_externo_key"
  ON "campanias"("cuenta_publicitaria_id", "id_externo");
CREATE UNIQUE INDEX "campanias_cuenta_anuncios_conexion_id_id_externo_key"
  ON "campanias"("cuenta_anuncios_conexion_id", "id_externo");

CREATE UNIQUE INDEX "campania_metricas_diarias_campania_fecha_red_key" ON "campania_metricas_diarias"("campania_id", "fecha", "red_social");
CREATE INDEX "idx_campania_metricas_diarias_fecha" ON "campania_metricas_diarias"("fecha");

-- AddForeignKey
ALTER TABLE "cuentas_anuncios_conexiones" ADD CONSTRAINT "cuentas_anuncios_conexiones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cuentas_anuncios_conexiones" ADD CONSTRAINT "cuentas_anuncios_conexiones_autorizado_por_usuario_id_fkey" FOREIGN KEY ("autorizado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cuentas_anuncios_oauth_states" ADD CONSTRAINT "cuentas_anuncios_oauth_states_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cuentas_anuncios_oauth_states" ADD CONSTRAINT "cuentas_anuncios_oauth_states_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campanias" ADD CONSTRAINT "campanias_cuenta_publicitaria_id_fkey" FOREIGN KEY ("cuenta_publicitaria_id") REFERENCES "cuentas_publicitarias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campanias" ADD CONSTRAINT "campanias_cuenta_anuncios_conexion_id_fkey" FOREIGN KEY ("cuenta_anuncios_conexion_id") REFERENCES "cuentas_anuncios_conexiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campania_metricas_diarias" ADD CONSTRAINT "campania_metricas_diarias_campania_id_fkey" FOREIGN KEY ("campania_id") REFERENCES "campanias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grants for the runtime role and the audited read-only discovery role.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "cuentas_anuncios_conexiones",
  "cuentas_anuncios_oauth_states",
  "campania_metricas_diarias"
TO "crm_app";
GRANT SELECT ON "cuentas_anuncios_conexiones" TO "crm_bypass_jobs";

-- RLS: direct company-owned tables.
ALTER TABLE "cuentas_anuncios_conexiones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cuentas_anuncios_conexiones" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cuentas_anuncios_conexiones"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

ALTER TABLE "cuentas_anuncios_oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cuentas_anuncios_oauth_states" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cuentas_anuncios_oauth_states"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);

-- RLS: Campania now has two ownership paths, Page legacy or Meta Ads account.
DROP POLICY IF EXISTS "tenant_isolation" ON "campanias";
CREATE POLICY "tenant_isolation" ON "campanias"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "cuentas_publicitarias" cp
    JOIN "bridges" b ON b."id" = cp."bridge_id"
    WHERE cp."id" = "campanias"."cuenta_publicitaria_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
  OR EXISTS (
    SELECT 1 FROM "cuentas_anuncios_conexiones" cac
    WHERE cac."id" = "campanias"."cuenta_anuncios_conexion_id"
      AND cac."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "cuentas_publicitarias" cp
    JOIN "bridges" b ON b."id" = cp."bridge_id"
    WHERE cp."id" = "campanias"."cuenta_publicitaria_id"
      AND b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
  OR EXISTS (
    SELECT 1 FROM "cuentas_anuncios_conexiones" cac
    WHERE cac."id" = "campanias"."cuenta_anuncios_conexion_id"
      AND cac."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
  )
);

ALTER TABLE "campania_metricas_diarias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campania_metricas_diarias" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "campania_metricas_diarias"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "campanias" c
    LEFT JOIN "cuentas_publicitarias" cp ON cp."id" = c."cuenta_publicitaria_id"
    LEFT JOIN "bridges" b ON b."id" = cp."bridge_id"
    LEFT JOIN "cuentas_anuncios_conexiones" cac ON cac."id" = c."cuenta_anuncios_conexion_id"
    WHERE c."id" = "campania_metricas_diarias"."campania_id"
      AND (
        b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
        OR cac."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
      )
  )
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "campanias" c
    LEFT JOIN "cuentas_publicitarias" cp ON cp."id" = c."cuenta_publicitaria_id"
    LEFT JOIN "bridges" b ON b."id" = cp."bridge_id"
    LEFT JOIN "cuentas_anuncios_conexiones" cac ON cac."id" = c."cuenta_anuncios_conexion_id"
    WHERE c."id" = "campania_metricas_diarias"."campania_id"
      AND (
        b."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
        OR cac."empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
      )
  )
);
