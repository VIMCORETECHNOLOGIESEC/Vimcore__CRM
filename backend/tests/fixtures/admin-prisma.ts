import { PrismaClient } from "@prisma/client";

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
export const testAdminPrisma = new PrismaClient();
