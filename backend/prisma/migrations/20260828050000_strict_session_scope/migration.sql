CREATE TYPE "SessionScope" AS ENUM ('COMPANY', 'HOLDING');

ALTER TABLE "refresh_tokens"
  ADD COLUMN "session_scope" "SessionScope";

UPDATE "refresh_tokens"
SET "session_scope" = CASE
  WHEN "membresia_id" IS NULL THEN 'HOLDING'::"SessionScope"
  ELSE 'COMPANY'::"SessionScope"
END;

ALTER TABLE "refresh_tokens"
  ALTER COLUMN "session_scope" SET NOT NULL,
  DROP CONSTRAINT "refresh_tokens_membresia_id_fkey";

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_membresia_id_fkey"
  FOREIGN KEY ("membresia_id") REFERENCES "membresias"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "refresh_tokens_session_scope_membership_check"
  CHECK (
    ("session_scope" = 'COMPANY' AND "membresia_id" IS NOT NULL)
    OR ("session_scope" = 'HOLDING' AND "membresia_id" IS NULL)
  );
