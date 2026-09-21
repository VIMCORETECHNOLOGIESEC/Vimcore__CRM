import { PrismaClient } from "@prisma/client";
import { EMPRESA_BOOTSTRAP_ID } from "./empresa.js";

/**
 * Bloque C (Etapa 3, Group 0/D8) — cliente Prisma admin dedicado
 * EXCLUSIVAMENTE a preparar fixtures de prueba (arrange), nunca a las
 * aserciones bajo prueba.
 *
 * Desde que `lib/prisma.ts::basePrisma` se conecta como `crm_app` (rol no
 * superusuario, D8), cualquier escritura directa a una tabla con RLS
 * (`leads`, `membresias`, `bridges`, `citas`, `lead_eventos`,
 * `notificaciones`) fuera de `runWithTenantContext` viola la política RLS —
 * exactamente el comportamiento correcto en producción, pero un obstáculo
 * para preparar datos de prueba sin acoplar cada fixture helper a un
 * `empresaId`/contexto real que no es lo que ese test está verificando.
 *
 * Este cliente usa `DATABASE_URL` (superusuario `crm_dev`, vía el
 * constructor sin argumentos de `PrismaClient`), el mismo patrón ya usado
 * por `tests/setup.ts::globalSetup` y `prisma/seed.ts` para operaciones
 * administrativas fuera de banda. Las aserciones de negocio de cada test
 * siguen ejerciendo el `prisma` real (`crm_app`, importado de
 * `src/lib/prisma.js`) — invocado siempre indirectamente a través del
 * servicio/repositorio bajo prueba — así que RLS sigue siendo probada donde
 * importa. Usar `testAdminPrisma` solo para arrange (`create`/`createMany`/
 * `update`/`updateMany`/`upsert` de fixtures), nunca para el código bajo
 * prueba ni para aserciones que deban demostrar aislamiento por tenant.
 */
const baseAdminPrisma = new PrismaClient();

/**
 * holding-scoped-tenant-isolation (T5c): id of the holding created by
 * `resolveTestHoldingId` when the bootstrap empresa has none.
 */
const TEST_HOLDING_ID = "00000000-0000-0000-0000-0000000000f2";

const HOLDING_WIDE_LEGACY_ROLES: readonly string[] = ["ADMINISTRADOR", "SUPERVISOR"];

let testHoldingIdPromise: Promise<string> | undefined;

/**
 * Default holding of the test suite = the holding that owns the bootstrap
 * empresa (`EMPRESA_BOOTSTRAP_ID`, the empresa almost every fixture uses). The
 * migrations link it to the "Default holding" (20260918200100); on a database
 * where it has none, a fixed test holding is created and linked (idempotent,
 * safe across parallel workers: fixed id + upsert).
 */
function resolveTestHoldingId(): Promise<string> {
  testHoldingIdPromise ??= (async () => {
    const bootstrap = await baseAdminPrisma.empresa.findUnique({
      where: { id: EMPRESA_BOOTSTRAP_ID },
      select: { holdingId: true },
    });
    if (bootstrap?.holdingId) return bootstrap.holdingId;

    await baseAdminPrisma.holding.upsert({
      where: { id: TEST_HOLDING_ID },
      update: {},
      create: { id: TEST_HOLDING_ID, nombre: "Holding de pruebas" },
    });
    await baseAdminPrisma.empresa.updateMany({
      where: { id: EMPRESA_BOOTSTRAP_ID, holdingId: null },
      data: { holdingId: TEST_HOLDING_ID },
    });
    return TEST_HOLDING_ID;
  })();
  return testHoldingIdPromise;
}

/**
 * Legacy holding-wide users (ADMINISTRADOR/SUPERVISOR log in as a holding
 * session) are rejected with 403 `identidad_no_vinculada` unless
 * `usuarios.holding_id` is set. The fixtures of ~47 DB-backed files create
 * such users without a holding, so this central hook links them to the test
 * holding by default. Opt out with an explicit `holdingId: null` (or pass
 * `holding`), which is how tests assert the fail-closed behavior.
 */
async function withDefaultHolding<T extends { rol?: unknown }>(data: T): Promise<T> {
  if (typeof data.rol !== "string" || !HOLDING_WIDE_LEGACY_ROLES.includes(data.rol)) return data;
  if ("holdingId" in data || "holding" in data) return data;
  return { ...data, holdingId: await resolveTestHoldingId() };
}

const extendedAdminPrisma = baseAdminPrisma.$extends({
  query: {
    usuario: {
      async create({ args, query }) {
        return query({ ...args, data: await withDefaultHolding(args.data) });
      },
      async createMany({ args, query }) {
        const rows = Array.isArray(args.data) ? args.data : [args.data];
        const data = await Promise.all(rows.map((row) => withDefaultHolding(row)));
        return query({ ...args, data });
      },
      async upsert({ args, query }) {
        return query({ ...args, create: await withDefaultHolding(args.create) });
      },
    },
  },
});

// Cast: the extension only rewrites `create` inputs; keeping the plain
// `PrismaClient` type preserves every existing call site (e.g. `seedTenant`).
export const testAdminPrisma = extendedAdminPrisma as unknown as PrismaClient;
