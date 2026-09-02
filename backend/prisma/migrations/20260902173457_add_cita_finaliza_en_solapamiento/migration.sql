-- Vista de calendario (feature aditiva post-M7): fin explícito de la cita
-- (`finaliza_en`), duración mínima de 1h y no-solapamiento de horario por
-- asesor. `--create-only` generó solo el `ADD COLUMN ... NOT NULL` (falla
-- contra datos existentes, ver el warning); reescrito a mano siguiendo el
-- mismo patrón de 3 pasos que `20260827100000_rls_tenant_isolation`
-- (columna nullable -> backfill -> `SET NOT NULL`).

-- AlterTable: citas.finaliza_en (nullable primero para poder backfillar).
ALTER TABLE "citas" ADD COLUMN "finaliza_en" TIMESTAMPTZ(6);

-- Backfill: toda cita existente asume 1h de duración (mínimo válido nuevo).
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
