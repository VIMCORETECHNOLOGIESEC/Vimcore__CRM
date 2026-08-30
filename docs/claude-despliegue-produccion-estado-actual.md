# Handoff despliegue en producción — estado actual (2026-08-30)

> **Material de coordinación:** explica dónde quedó el despliegue real del
> backend en Azure y qué falta. No reemplaza a `docs/00-estado-documentacion.md`
> ni a `.env.example.deployback`.

## Backend en producción — confirmado funcionando

- **URL**: `https://arcano-crm.happyground-63307e62.eastus.azurecontainerapps.io`
- **Verificación**: `GET /api/v1/salud` → `{"status":"ok","database":"ok"}`
- **Infraestructura** (resource group `documents`, holding Arcano):
  - Container App: `arcano-crm` (Consumption, 1 vCPU / 2GiB, ingress externo público, puerto 3000)
  - Container Registry: `nexuscorp.azurecr.io/arcano-crm:latest`
  - Base de datos: Azure Database for PostgreSQL Flexible Server `nexus-postgres`, base `crm_arcano` — 34 migraciones aplicadas, RLS real vía rol `crm_app` (no superusuario)
  - Azure Blob Storage: cuenta `nexuscorp` — contenedor `isotipos` (público, para logos de empresa) y `reportes` (privado, PDF/XLSX vía URL firmada temporal)
- **Usuarios holding-wide iniciales** ya creados vía `backend/prisma/bootstrap-produccion.ts` — ver `docs/credenciales-produccion-arcano.md` (gitignoreado) para las credenciales reales.

## Decisiones/hallazgos reales de este despliegue (no repetir el mismo camino)

- Azure Database for PostgreSQL Flexible Server: el admin NO es superusuario real (`rolsuper = false`) — la migración `20260827100000_rls_tenant_isolation` asumía que sí (revocaba un flag `BYPASSRLS` redundante ahí). Verificado con `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` antes de migrar. No hizo falta ningún fix de código: `crm_app`/`crm_bypass_jobs` se crean igual (necesitan `CREATEROLE`, no `SUPERUSER`), y el admin no necesitaba de vuelta el bypass para nada de lo que corre en este batch.
- La extensión `citext` no está en la lista blanca de Azure por default — hay que habilitarla en el servidor (`azure.extensions` server parameter) antes de la primera migración.
- `DATABASE_URL` (admin, solo migraciones) y `DATABASE_URL_APP` (runtime real, usuario `crm_app`) son DOS variables distintas y fáciles de confundir — un error real de esta sesión fue poner el usuario admin en `DATABASE_URL_APP`, causando `{"status":"degradado","database":"error"}` en `/salud` pese a que las migraciones corrían bien.
- Editar variables de entorno del Container App por el Portal y por `az containerapp update` en el mismo período genera inconsistencias (el formulario del Portal reenvía TODO su estado cacheado, pudiendo revivir una variable ya corregida por CLI). Recomendado: un solo camino por sesión de cambios, verificar con `az containerapp show` después de cualquier edición por Portal.
- El Dockerfile de producción (`RUN pnpm build` real, no `tsx` sin typecheck) destapó bugs de tipos reales que nunca se habían detectado (LinkedIn token rotation, bridgeApi `Partial`/`Pick`, Puppeteer `waitUntil`, `packages/schemas` nunca copiado a la imagen) — todos corregidos, ver historial de commits de `dev-mateo` del 2026-08-29/30.

## CI/CD

`.github/workflows/deploy-backend.yml` — dispara con push a `main` (deliberadamente NO en `dev-mateo`/`test/gpt`, para que ninguna rama de desarrollo dispare un deploy real por accidente). Dos jobs: `test` (Postgres de servicio, migra, corre la suite completa) → `deploy` (build, push a ACR, actualiza el Container App). Requiere los secrets de GitHub: `AZURE_CREDENTIALS`, `CI_POSTGRES_PASSWORD`, `CI_JWT_SECRET`, `CI_TOKEN_ENCRYPTION_KEY` — configurados aparte, no versionados.

## Pendiente / gaps conocidos

- Frontend todavía no desplegado (va a un VPS aparte) — `CORS_ORIGIN` sigue en `*` temporalmente, cambiar al dominio real del frontend en cuanto exista.
- `LINKEDIN_API_BASE_URL` quedó sin usar (opcional, default al endpoint real de LinkedIn) — LinkedIn sí está configurado y activo (`LINKEDIN_CLIENT_ID`/`SECRET`/`API_VERSION`/`REDIRECT_URI` reales).
- Test flaky conocido (`sla-atrasado.job.test.ts` #8b) — contención de recursos en corridas largas de la suite completa, no relacionado a ningún código de este batch, ya diagnosticado en sesiones anteriores.
