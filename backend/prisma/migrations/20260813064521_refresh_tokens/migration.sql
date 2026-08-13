-- CreateTable
CREATE TABLE "refresh_tokens" (
    "jti" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "hash" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "revocado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_revocado_en_idx" ON "refresh_tokens"("usuario_id", "revocado_en");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
