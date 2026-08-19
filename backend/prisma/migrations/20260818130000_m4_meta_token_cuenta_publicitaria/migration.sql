-- CreateEnum
CREATE TYPE "estado_token_cuenta" AS ENUM ('VALIDO', 'TOKEN_EXPIRADO', 'ERROR');

-- AlterTable
ALTER TABLE "cuentas_publicitarias" ADD COLUMN     "estado_token" "estado_token_cuenta" NOT NULL DEFAULT 'VALIDO',
ADD COLUMN     "token_cifrado" TEXT,
ADD COLUMN     "token_expira_en" TIMESTAMPTZ(6),
ADD COLUMN     "secreto_webhook" TEXT;
