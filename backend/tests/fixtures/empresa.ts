/**
 * Bloque C (Fase 2/Stage 2, D4 — `Lead.empresaId`/`Bridge.empresaId` NOT
 * NULL sin backfill): id fijo de la "Empresa Bootstrap" insertada por la
 * migración `20260826184603_bloque_b_tenant_fundacion` (Bloque B, backfill
 * determinístico) — garantizada en TODO entorno de pruebas porque
 * `tests/setup.ts::globalSetup` nunca trunca `empresas` (solo
 * `refresh_tokens`/`usuarios`/`clientes`/`bridges`, con sus CASCADE). Usarla
 * como `empresaId` por defecto en fixtures de `Bridge`/`Lead` evita crear
 * una `Empresa` nueva por archivo cuando la prueba no necesita aislamiento
 * multi-empresa explícito — los tests que sí lo necesitan (aislamiento
 * cross-empresa) siguen creando su propia `Empresa` B con
 * `prisma.empresa.create(...)`, como ya hacía `notificacion.repository.test.ts`
 * / `deduplicacion.service.test.ts` antes de este archivo existir.
 */
export const EMPRESA_BOOTSTRAP_ID = "00000000-0000-0000-0000-000000000001";
