#!/bin/sh
# Produccion (Azure Container Apps, sin docker-compose que sobreescriba el
# comando): replica exactamente la secuencia que docker-compose.yml usa en
# local -- migrar con la credencial admin (DATABASE_URL), fijar la
# contrasena del rol de runtime no-superusuario crm_app (nunca vive en la
# migracion versionada, ver backend/prisma/migrations/
# 20260827100000_rls_tenant_isolation/migration.sql), y recien despues
# arrancar el servidor compilado con DATABASE_URL_APP (crm_app).
set -e

pnpm exec prisma migrate deploy

echo "ALTER ROLE crm_app WITH LOGIN PASSWORD '$CRM_APP_DB_PASSWORD';" | \
  pnpm exec prisma db execute --url "$DATABASE_URL" --stdin

exec node dist/index.js
