-- Vista de calendario (feature aditiva post-M7): fin explícito de la cita
-- (`finaliza_en`), duración mínima de 1h y no-solapamiento de horario por
-- asesor. `--create-only` generó solo el `ADD COLUMN ... NOT NULL` (falla
-- contra datos existentes, ver el warning); reescrito a mano siguiendo el
-- mismo patrón de 3 pasos que `20260827100000_rls_tenant_isolation`
-- (columna nullable -> backfill -> `SET NOT NULL`).

-- Fix (incidente de producción, 2026-09-02, segundo intento -- el primero,
-- con LOCK + doble backfill, fallo IDENTICO: eso descarta una condicion de
-- carrera, algo determinista estaba pasando). Root cause real: "citas" tiene
-- FORCE ROW LEVEL SECURITY desde 20260827100000_rls_tenant_isolation, con la
-- politica "tenant_isolation" (USING app.tenant_unrestricted = 'on' OR
-- empresa_id = app.tenant_empresa_id). FORCE aplica la politica incluso al
-- dueno de la tabla salvo que sea superusuario real de Postgres -- en Azure
-- Flexible Server el rol admin de migraciones NO lo es (a proposito, Azure no
-- da superuser real). Sin este SET, el UPDATE de backfill de abajo ve 0 filas
-- (ninguna sesion sin contexto de tenant matchea la politica), pero el
-- ALTER TABLE...SET NOT NULL sí escanea la tabla completa (RLS no aplica al
-- scan interno de DDL) y encuentra las filas reales todavia en NULL -- mismo
-- error 23502 determinista, no al azar (por eso fallo identico dos veces).
-- En local (.env.dev) pasa limpio porque el postgres de docker-compose corre
-- como superusuario real, que SIEMPRE ignora RLS sin importar FORCE. La
-- migracion que activo RLS en "citas" esquivo este mismo problema haciendo
-- su propio backfill de empresa_id ANTES de activar RLS en esa tabla, unas
-- lineas mas abajo en ese mismo archivo -- la nuestra llega despues, con RLS
-- ya activo, asi que necesita este SET explicito. Session-level (no
-- SET LOCAL): no depende de que el resto del archivo corra o no en una sola
-- transaccion.
SET app.tenant_unrestricted = 'on';

LOCK TABLE "citas" IN ACCESS EXCLUSIVE MODE;

-- AlterTable: citas.finaliza_en (nullable primero para poder backfillar).
ALTER TABLE "citas" ADD COLUMN "finaliza_en" TIMESTAMPTZ(6);

-- Backfill: toda cita existente asume 1h de duración (mínimo válido nuevo).
UPDATE "citas" SET "finaliza_en" = "programada_para" + INTERVAL '1 hour'
  WHERE "finaliza_en" IS NULL;

-- Segundo backfill, inmediatamente antes del SET NOT NULL -- agarra
-- cualquier fila que se haya colado entre el UPDATE de arriba y este punto.
UPDATE "citas" SET "finaliza_en" = "programada_para" + INTERVAL '1 hour'
  WHERE "finaliza_en" IS NULL;

ALTER TABLE "citas" ALTER COLUMN "finaliza_en" SET NOT NULL;

-- CHECK de duración mínima (defensa en profundidad -- Zod ya la rechaza en
-- el borde, `citas.schema.ts`).
ALTER TABLE "citas" ADD CONSTRAINT "citas_duracion_minima"
  CHECK ("finaliza_en" >= "programada_para" + INTERVAL '1 hour');

-- No-solapamiento de horario, solo entre citas AGENDADA del mismo asesor
-- (usuario_id) -- dos citas CANCELADA/CUMPLIDA/NO_ASISTIO pueden solaparse
-- libremente. Requiere btree_gist para poder combinar la igualdad de
-- usuario_id con el rango de tiempo en un mismo EXCLUDE.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "citas" ADD CONSTRAINT "citas_no_solapamiento_por_asesor"
  EXCLUDE USING gist (
    "usuario_id" WITH =,
    tstzrange("programada_para", "finaliza_en") WITH &&
  ) WHERE ("estado" = 'AGENDADA');
