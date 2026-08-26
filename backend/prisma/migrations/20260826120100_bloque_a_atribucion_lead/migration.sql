-- M-hardening Bloque A (WU4, spec lead-attribution, D6/D9): atribución
-- canónica de cuenta/campaña en leads, además de los escalares crudos ya
-- recibidos en la ingesta. Ambas FK son nullable y ON DELETE SET NULL — un
-- match ausente degrada en silencio; borrar una cuenta/campaña nunca debe
-- bloquear al lead que la referencia (mismo criterio que
-- leads.asesor_id/vendedor_id, docs/03-modelo-datos.md). Sin backfill
-- (proposal, fuera de alcance de Bloque A).
ALTER TABLE "leads"
  ADD COLUMN "cuenta_publicitaria_id" UUID,
  ADD COLUMN "campania_id" UUID,
  ADD COLUMN "id_externo_cuenta" TEXT,
  ADD COLUMN "id_externo_campania" TEXT,
  ADD COLUMN "nombre_campania" TEXT;

ALTER TABLE "leads" ADD CONSTRAINT "leads_cuenta_publicitaria_id_fkey"
  FOREIGN KEY ("cuenta_publicitaria_id") REFERENCES "cuentas_publicitarias"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_campania_id_fkey"
  FOREIGN KEY ("campania_id") REFERENCES "campanias"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_leads_campania" ON "leads"("campania_id");
CREATE INDEX "idx_leads_cuenta_publicitaria" ON "leads"("cuenta_publicitaria_id");
