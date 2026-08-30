-- reportes (Bloque E, docs/blocks/e-dashboards.md "Exportación PDF/XLSX").
--
-- Escrita a mano (no generada por `prisma migrate dev`): el sandbox de este
-- batch no tiene acceso a la base de compose (Docker bloqueado, ver reporte
-- del batch). Sigue exactamente el mismo patrón de las migraciones anteriores
-- (`20260829180602_add_negociacion_oportunidad_producto`) -- nombres de tabla/
-- columna vía `@@map`/`@map` del schema, mismo orden CreateEnum -> CreateTable
-- -> CreateIndex -> AddForeignKey -> RLS.

-- CreateEnum
CREATE TYPE "estado_reporte_job" AS ENUM ('PENDIENTE', 'PROCESANDO', 'LISTO', 'ERROR');

-- CreateTable
CREATE TABLE "configuraciones_reporte" (
    "id" UUID NOT NULL,
    "empresa_id" UUID,
    "secciones" JSONB NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "configuraciones_reporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Deliberadamente SIN columna "empresa_id" (ver comentario del modelo
-- `ReporteJob` en schema.prisma): el scope empresarial se deriva siempre
-- server-side desde "usuario_id" + Membresia activas, nunca se persiste acá.
CREATE TABLE "reporte_jobs" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "parametros" JSONB NOT NULL,
    "estado" "estado_reporte_job" NOT NULL DEFAULT 'PENDIENTE',
    "archivo_url" TEXT,
    "error" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado_en" TIMESTAMPTZ(6),

    CONSTRAINT "reporte_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuraciones_reporte_empresa_id_key" ON "configuraciones_reporte"("empresa_id");

-- CreateIndex
CREATE INDEX "reporte_jobs_usuario_id_estado_idx" ON "reporte_jobs"("usuario_id", "estado");

-- AddForeignKey
ALTER TABLE "configuraciones_reporte" ADD CONSTRAINT "configuraciones_reporte_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporte_jobs" ADD CONSTRAINT "reporte_jobs_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- RLS -- solo "configuraciones_reporte" (tiene "empresa_id"). Mismo patrón
-- que "notificaciones" (20260827100000_rls_tenant_isolation): tercera rama
-- "empresa_id IS NULL" para la configuración default holding-wide.
-- "reporte_jobs" NO lleva política -- no tiene columna "empresa_id" que
-- comparar (ver comentario del modelo en schema.prisma); su aislamiento vive
-- en la capa de aplicación, filtrando siempre por "usuario_id".
--
-- "crm_app" ya recibe SELECT/INSERT/UPDATE/DELETE sobre AMBAS tablas nuevas
-- automáticamente vía `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN
-- SCHEMA public ...` (fijado en 20260827100000_rls_tenant_isolation, sección
-- 5) -- ningún GRANT adicional hace falta acá siempre que esta migración
-- corra con el mismo rol admin que corrió esa.
-- ============================================================

ALTER TABLE "configuraciones_reporte" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "configuraciones_reporte" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "configuraciones_reporte"
USING (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" IS NULL
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
)
WITH CHECK (
  current_setting('app.tenant_unrestricted', true) = 'on'
  OR "empresa_id" IS NULL
  OR "empresa_id" = NULLIF(current_setting('app.tenant_empresa_id', true), '')::uuid
);
