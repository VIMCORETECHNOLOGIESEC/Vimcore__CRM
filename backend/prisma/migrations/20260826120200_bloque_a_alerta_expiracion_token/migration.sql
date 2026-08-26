-- M-hardening Bloque A (WU5, spec token-expiry-alerting): marcador de
-- idempotencia para la alerta preventiva TOKEN_POR_EXPIRAR. Nullable
-- timestamptz, NO booleano — guarda el ÚLTIMO tokenExpiraEn ya alertado; un
-- token renovado (tokenExpiraEn distinto) rearma la alerta automáticamente
-- sin necesitar una escritura de reseteo separada (a diferencia de
-- bridges.advertencia_mudo_enviada).
ALTER TABLE "cuentas_publicitarias" ADD COLUMN "alerta_expiracion_para_en" TIMESTAMPTZ(6);
