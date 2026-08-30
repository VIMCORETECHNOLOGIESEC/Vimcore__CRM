import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "./app-error.js";
import { logger } from "./logger.js";
import {
  currentTenantContext,
  runWithTenantContext,
  type TenantContext,
} from "./tenant-context.js";

export { runWithTenantContext };
export type { TenantContext };

/**
 * Bloque C (Etapa 3, D2/D3) — carrier de tenant por-request. `empresaId:
 * null` = holding-wide (`app.tenant_unrestricted = 'on'`, ADMINISTRADOR/
 * SUPERVISOR, D3); `empresaId: string` = scoped a esa empresa
 * (`app.tenant_empresa_id`). Ausencia total de contexto (`getStore() ===
 * undefined`, ningún `runWithTenantContext` activo) es el estado
 * fail-closed (spec "Missing tenant context reads nothing") — nunca se
 * confunde con `empresaId: null` (que SÍ es un estado válido y amplio,
 * D3), son dos cosas distintas a propósito.
 */
/**
 * D2 (fix batch 2) — carrier interno, NADA que ver con `TenantContext`
 * (D2/D3): marca "ya estamos dentro de una transacción interactiva que ya
 * aplicó las GUCs de tenant" (vía el `$transaction` sobrescrito abajo o
 * `runAsBypassJob`), para que `$allOperations` sepa si debe abrir su propia
 * transacción o ejecutar directo. NO se puede inferir esto inspeccionando
 * `this` dentro de `$allOperations` — verificado empíricamente (Prisma
 * 6.19.3): `this` ahí no expone en ningún caso un `$transaction` propio
 * (ni en la llamada de nivel superior ni dentro de una transacción abierta),
 * así que `typeof this.$transaction === "function"` es SIEMPRE `false`, lo
 * que hacía que el código previo NUNCA envolviera ninguna query en una
 * transacción propia y NUNCA aplicara las GUCs — bug real, enmascarado en
 * el batch anterior porque `crm_dev` (superusuario) ignoraba RLS de todos
 * modos, así que ninguna query fallaba ni se notaba la ausencia de GUCs.
 */
const gucAppliedStorage = new AsyncLocalStorage<true>();

function alreadyInGucTransaction(): boolean {
  return gucAppliedStorage.getStore() === true;
}

/**
 * Punto de entrada único para poblar el carrier (D2) — invocado por
 * `require-authentication.middleware.ts` alrededor de `next()`, así que todo
 * el resto del ciclo de vida de la request (controllers, services,
 * repositorios) corre dentro de este `AsyncLocalStorage.run`.
 */
/**
 * D2 — coloca las GUCs de sesión (`app.tenant_empresa_id`/
 * `app.tenant_unrestricted`) vía `set_config(..., true)` (tercer argumento
 * `true` = `SET LOCAL`, dura solo la transacción viva) sobre el cliente
 * recibido (siempre un `Prisma.TransactionClient` — nunca el `prisma` base,
 * D2/D-H: "SET LOCAL solo sobrevive dentro de una transacción").
 *
 * Sin contexto activo (`currentTenantContext() === undefined`), esta función
 * NO ESCRIBE NADA a propósito (spec "Fail-closed without tenant context" +
 * "Tenant context is per-request, never leaked"): cada transacción nueva
 * arranca sin ningún `SET LOCAL` previo sobreviviente (la transacción
 * anterior en la misma conexión pooled ya hizo commit/rollback, que es
 * exactamente el límite de vida de `SET LOCAL`), así que
 * `current_setting('app.tenant_*', true)` resuelve NULL sin necesidad de un
 * `RESET` explícito — evita el riesgo de "unrecognized configuration
 * parameter" al intentar resetear una GUC custom que esta conexión nunca
 * llegó a fijar.
 *
 * GOTCHA (fix batch 2, D8): lo anterior es cierto para el VALOR "LOCAL",
 * pero no para lo que `current_setting(..., true)` devuelve en la práctica.
 * Verificado empíricamente contra Postgres real: una vez que una conexión
 * fijó `app.tenant_empresa_id` con `SET LOCAL` al menos una vez (aunque esa
 * transacción ya haya hecho commit/rollback), transacciones POSTERIORES en
 * la misma conexión pooled que NUNCA vuelven a llamar `SET LOCAL` ven
 * `current_setting(..., true)` devolver STRING VACÍO (`''`), no `NULL`. Las
 * 6 políticas RLS (migración `20260827100000_rls_tenant_isolation`) usan
 * `NULLIF(current_setting(...), '')::uuid` (no un cast directo) precisamente
 * por esto — sin el `NULLIF`, `''::uuid` lanza un error real de Postgres en
 * vez de simplemente no matchear ninguna fila.
 */
async function applyTenantGucs(tx: Prisma.TransactionClient): Promise<void> {
  const context = currentTenantContext();
  if (context === undefined) return;

  if (context.empresaId === null) {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.tenant_unrestricted', 'on', true)`,
    );
    return;
  }

  await tx.$executeRaw(
    Prisma.sql`SELECT set_config('app.tenant_empresa_id', ${context.empresaId}, true)`,
  );
}

/**
 * D8 (Bloque C, Etapa 3) — conecta como `crm_app` (no-superusuario), nunca
 * como `crm_dev` (`DATABASE_URL`, superusuario, reservado a `prisma migrate
 * deploy`/`seed.ts`). Sin este cambio, RLS/FORCE ROW LEVEL SECURITY no tiene
 * ningún efecto: Postgres ignora RLS incondicionalmente para superusuarios,
 * sin excepción — no es un problema de configuración de política, es una
 * propiedad del motor.
 */
const basePrisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL_APP });

/**
 * D2 (diseño, "matching Prisma's documented RLS pattern") — cliente
 * compartido único (nunca un segundo pool, precondición del diseño): la
 * extensión `$allOperations` envuelve TODA operación de modelo/raw en una
 * transacción interactiva propia cuando la llamada entra directo sobre
 * `prisma` (fuera de una transacción explícita del llamador), fija las GUCs
 * de tenant como primer statement de esa transacción y recién después
 * ejecuta la query real (`query(args)`) — así la política RLS de Postgres
 * siempre ve el `SET LOCAL` de ESTA request en la MISMA conexión/transacción
 * que la query que sigue.
 *
 * Cuando la llamada ya corre dentro de una transacción abierta por el
 * llamador (`runInTransaction`/`prisma.$transaction(...)` — el `tx` que
 * reciben los repositorios), esa misma transacción ya aplicó las GUCs una
 * sola vez al abrirse; `$allOperations` detecta ese estado vía
 * `gucAppliedStorage` (ver más abajo, fix batch 2) y ejecuta directo, sin
 * abrir una transacción anidada ni reaplicar nada.
 *
 * FIX (batch 2, D8 acceptance): la versión original de esta extensión
 * intentaba distinguir "llamada de nivel superior" de "ya dentro de una
 * transacción" inspeccionando `typeof this.$transaction` dentro de
 * `$allOperations`. Verificado empíricamente que eso es SIEMPRE `undefined`
 * en Prisma 6.19.3 (el `this` que `$allOperations` recibe no expone nunca
 * un `$transaction` propio, ni en la llamada de nivel superior ni dentro de
 * una transacción abierta) — el código caía siempre en la rama "ya estamos
 * en una transacción" y NUNCA envolvía ninguna query suelta, así que
 * `applyTenantGucs` nunca corría para llamadas directas sobre `prisma`
 * (`prisma.lead.findMany()`, `prisma.lead.create()`, etc. — exactamente el
 * patrón que usan los 3 tests RED del batch 1). Esto quedó enmascarado todo
 * el batch anterior porque `crm_dev` (superusuario) ignora RLS sin importar
 * las GUCs. D8 (rol `crm_app`, no-superusuario) hizo el bug visible de
 * inmediato como un error `new row violates row-level security policy` en
 * el primer INSERT bajo contexto de tenant — reemplazado por el carrier
 * `gucAppliedStorage`, que no depende de `this`.
 */
export const prisma = basePrisma.$extends({
  name: "tenant-context-rls",
  client: {
    /**
     * D2 — envuelve TODO `prisma.$transaction(fn, bounds)` (incluido el que
     * abre `runInTransaction`, D1 "M4"): aplica las GUCs de tenant como
     * PRIMER statement dentro de la transacción interactiva real
     * (`basePrisma.$transaction`, cliente sin extender — acceso directo a
     * `tx.$executeRaw`), antes de invocar el callback del llamador, y marca
     * `gucAppliedStorage` para toda la duración de ese callback.
     */
    $transaction<T>(
      this: unknown,
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      bounds?: TransactionBounds,
    ): Promise<T> {
      return basePrisma.$transaction(async (tx) => {
        await applyTenantGucs(tx);
        return gucAppliedStorage.run(true, () => fn(tx));
      }, bounds);
    },
  },
  query: {
    async $allOperations({ model, operation, args, query }) {
      if (alreadyInGucTransaction()) {
        // Ya estamos dentro de una transacción interactiva que ya aplicó
        // las GUCs de tenant (override de `$transaction` arriba, o
        // `runAsBypassJob`) — ejecutar directo, sin abrir una segunda
        // transacción anidada ni reaplicar nada.
        return query(args);
      }
      // Llamada directa (fuera de una transacción explícita del llamador):
      // abre una transacción propia (mismo seam que el override de
      // `$transaction` arriba, GUCs incluidas).
      //
      // IMPORTANTE (fix batch 2, segundo bug descubierto empíricamente):
      // NO alcanza con re-invocar el `query(args)` capturado dentro de la
      // nueva transacción (`prisma.$transaction(() => query(args))`) — esa
      // closure quedó atada, en el momento en que `$allOperations` se
      // disparó para esta llamada de nivel superior, al estado "sin
      // transacción activa"; envolverla DESPUÉS en una transacción nueva no
      // la reata a esa transacción, así que el INSERT/SELECT real termina
      // ejecutándose fuera de ella — la GUC ya aplicada (confirmada con
      // `SELECT current_setting(...)` dentro de la misma transacción) nunca
      // llega a ver la query. En cambio, reconstruir la llamada directamente
      // sobre el `tx` recibido (`tx[modelProp][operation](args)`) SÍ ejecuta
      // en la conexión/transacción correcta — mismo patrón que ya usa el
      // resto del código (`runInTransaction`, repositorios) para operaciones
      // de modelo. Para operaciones raw sin `model` (p. ej. `$queryRaw`
      // suelto fuera de cualquier transacción explícita) no hay forma
      // genérica de reconstruir la llamada sobre `tx`, así que se ejecuta
      // `query(args)` directo (sin transacción propia) — CUALQUIER caller
      // que use `$queryRaw`/`$executeRaw` fuera de una transacción explícita
      // NUNCA ve las GUCs de tenant aplicadas, sin importar si hay un
      // `TenantContext` activo (D2 gap, batch 3+ discovery, bug real
      // encontrado en producción — no una hipótesis). Los callers reales de
      // este código base (`lead-recibido.repository.ts::aceptarLeadRecibido`/
      // `aceptarLeadgenMetaPendiente`/`claimNext`/`marcarFallo`) por eso NUNCA
      // invocan sus raw queries directo sobre `prisma` — siempre reciben un
      // `tx` ya abierto por el llamador (`ingesta.service.ts::ingestarLead`,
      // `meta-webhook.service.ts::encolarLeadgenMeta`,
      // `jobs/ingesta-inbox.job.ts::runIngestionOnce`, todos vía
      // `runInTransaction`/`prisma.$transaction` explícito) para que este
      // seam SÍ aplique las GUCs antes del raw query.
      if (model === undefined) {
        return query(args);
      }
      const modelProp = model.charAt(0).toLowerCase() + model.slice(1);
      return basePrisma.$transaction(async (tx) => {
        await applyTenantGucs(tx);
        return gucAppliedStorage.run(true, () => {
          const delegate = (tx as unknown as Record<string, Record<string, (a: unknown) => unknown>>)[
            modelProp
          ];
          return delegate[operation](args);
        });
      });
    },
  },
});

/**
 * D1 (diseño, "SET LOCAL ROLE ... solo desde runAsBypassJob()") — el ÚNICO
 * seam que puede correr una query bajo `crm_bypass_jobs` (BYPASSRLS, además
 * `SET TRANSACTION READ ONLY` — solo sirve para DESCUBRIR filas de solo
 * lectura entre empresas, nunca para escribir; cualquier escritura resultante
 * corre después bajo `runWithTenantContext`/`prisma.$transaction` con el
 * `empresaId` real ya resuelto, ver `asignacion.service.ts::assignAfterCommit`
 * como ejemplo del patrón). Nunca llamado desde un request path HTTP (spec §2
 * "Bypass role unreachable from HTTP") — grep-able por nombre, invocado desde
 * los 7 call sites de `BYPASS_JOB_ALLOWLIST` (uno por entrada, spec "Bypass
 * usage is enumerated and documented"): `sla-atrasado.service.ts`,
 * `citas-recordatorio.service.ts`, `bridge-mudo.service.ts`,
 * `verificacion-token.service.ts` (2 sites: `token-verification` y
 * `token-expiry-alert`), `asignacion.service.ts::assignAfterCommit`
 * (`post-commit-assignment`) y `asignacion.service.ts::
 * recordAssignmentDegradation` (`assignment-degradation`). Abre SIEMPRE su
 * propia transacción — un job de bypass nunca recibe una `tx` externa por
 * parámetro, a diferencia de `runInTransaction` (D1: los jobs corren fuera
 * de cualquier ciclo de request). El worker de ingesta durable
 * (`jobs/ingesta-inbox.job.ts::runIngestionOnce`) NO usa este seam — necesita
 * `UPDATE` (`claimNext`/`marcarFallo`), incompatible con `READ ONLY`; usa en
 * cambio el GUC holding-wide (`runWithTenantContext({ empresaId: null })`,
 * D3) bajo el rol `crm_app` normal, ver `INGESTA_WORKER_TRANSACTION_BOUNDS`.
 */
export const BYPASS_JOB_ALLOWLIST = {
  "sla-overdue": { owner: "sla-atrasado", reason: "discover overdue leads", partitionBy: "empresaId" },
  "appointment-reminder": { owner: "citas-recordatorio", reason: "discover pending appointments", partitionBy: "empresaId" },
  "silent-bridge": { owner: "bridge-mudo", reason: "discover inactive bridges", partitionBy: "empresaId" },
  "token-verification": { owner: "verificacion-token", reason: "discover loaded tokens", partitionBy: "empresaId" },
  "token-expiry-alert": { owner: "verificacion-token", reason: "discover expiring tokens", partitionBy: "empresaId" },
  "meta-ads-sync": { owner: "meta-ads-sync", reason: "discover active Meta Ads connections", partitionBy: "empresaId" },
  "post-commit-assignment": { owner: "assignAfterCommit", reason: "resolve lead company after request commit", partitionBy: "empresaId" },
  "assignment-degradation": { owner: "assignAfterCommit", reason: "resolve incident company after retries", partitionBy: "empresaId" },
} as const;

export type BypassJobId = keyof typeof BYPASS_JOB_ALLOWLIST;

export async function runAsBypassJob<T>(
  jobId: BypassJobId,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  bounds: TransactionBounds,
): Promise<T> {
  const metadata = BYPASS_JOB_ALLOWLIST[jobId];
  if (!metadata) {
    throw new AppError("bypass_no_autorizado", 500, "El caller no está autorizado para usar bypass");
  }
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL ROLE crm_bypass_jobs");
    logger.info(
      { event: "bypass_discovery", holdingWide: true, jobId, ...metadata },
      "bypass de solo lectura iniciado",
    );
    return fn(tx);
  }, bounds);
}

/**
 * D2 gap closure (batch 3 discovery, regresión real de D8): antes de que
 * exista un `TenantContext` (`require-authentication.middleware.ts::
 * resolverEmpresaId`), el middleware necesita leer las `Membresia` activas
 * del usuario YA AUTENTICADO (JWT ya verificado, `usuario.id` confiable) para
 * decidir su `empresaId` — pero `membresias` tiene RLS (D4) y todavía no hay
 * `app.tenant_empresa_id` que fijar. Esa lectura NO puede pasar por
 * `runAsBypassJob`: spec §2 ("Bypass role unreachable from HTTP") prohíbe
 * expresamente que CUALQUIER camino HTTP corra bajo `crm_bypass_jobs`, y este
 * es un camino HTTP (se ejecuta en cada request autenticado). En cambio, este
 * seam fija un GUC dedicado y más angosto (`app.tenant_bootstrap_usuario_id`)
 * — el rol de conexión sigue siendo `crm_app` en todo momento, nunca
 * `crm_bypass_jobs`. La política RLS adicional en `membresias` (migración
 * `20260827100000_rls_tenant_isolation`, sección 4b) solo permite ver filas
 * de ESE `usuario_id` exacto, nunca una tabla completa ni otro usuario —
 * scoped al mínimo necesario para bootstrapear el TenantContext real.
 *
 * Bug real que este seam corrige: sin él, `resolverEmpresaId` siempre veía 0
 * `Membresia` (RLS fail-closed sin contexto), así que CUALQUIER usuario
 * ASESOR/VENDEDOR recibía 403 `contexto_empresa_no_resuelto` en cada
 * request, incluso con credenciales válidas — enmascarado en batches 1-2
 * porque `crm_dev` (superusuario) ignoraba RLS; visible recién al correr la
 * suite completa bajo `crm_app` (D8, batch 3).
 */
export async function withBootstrapUsuarioGuc<T>(
  usuarioId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.tenant_bootstrap_usuario_id', ${usuarioId}, true)`,
    );
    return gucAppliedStorage.run(true, () => fn(tx));
  }, AUTH_BOOTSTRAP_TRANSACTION_BOUNDS);
}

/**
 * D2 gap closure (batch 3 discovery), segunda variante: `auth.service.ts::
 * login` (dual-login-routing, dos caminos de credencial) necesita leer
 * `Membresia` por `correo` ANTES de saber siquiera a qué `usuarioId`
 * pertenece esa fila — no hay JWT todavía, es el paso que emite el JWT. Mismo
 * razonamiento que `withBootstrapUsuarioGuc` (spec §2 prohíbe
 * `crm_bypass_jobs` en cualquier camino HTTP, login incluido), pero acotado
 * por `correo` en vez de `usuario_id` porque en este punto el correo es el
 * único dato confiable disponible (aún sin verificar contraseña).
 */
export async function withBootstrapCorreoGuc<T>(
  correo: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.tenant_bootstrap_correo', ${correo}, true)`,
    );
    return gucAppliedStorage.run(true, () => fn(tx));
  }, AUTH_BOOTSTRAP_TRANSACTION_BOUNDS);
}

/**
 * D2 gap closure (batch 3 discovery), tercera variante:
 * `require-bridge-key.middleware.ts` (autenticación `X-Bridge-Key` de todo
 * el pipeline de ingesta — webhooks Meta/Google Forms) necesita leer
 * `bridges` (RLS) por `claveApiHash` ANTES de saber a qué `empresaId`
 * pertenece esa fila — exactamente el mismo bootstrap que `resolverEmpresaId`
 * (`usuario_id`) y `login` (`correo`), pero acotado por el hash de la clave
 * de API. `crm_bypass_jobs` sigue prohibido (spec §2, es un camino HTTP).
 */
export async function withBootstrapClaveApiHashGuc<T>(
  claveApiHash: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.tenant_bootstrap_clave_api_hash', ${claveApiHash}, true)`,
    );
    return gucAppliedStorage.run(true, () => fn(tx));
  }, AUTH_BOOTSTRAP_TRANSACTION_BOUNDS);
}

/**
 * Alias compartido para repositorios que aceptan tanto el cliente global
 * como un `Prisma.TransactionClient` (D-M3): permite que funciones de
 * distintos repositorios corran dentro de la misma transacción sin duplicar
 * este tipo en cada archivo.
 */
export type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

/** Límites de espera/duración de una transacción interactiva de Prisma. */
export interface TransactionBounds {
  maxWait: number;
  timeout: number;
}

/**
 * Límites de la transacción de `deduplicateLead` cuando abre la suya propia
 * (M3, sin cambios de comportamiento).
 */
export const DEDUPLICACION_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `ingesta.service` (M4): envuelve a
 * `deduplicateLead` más los pasos de recepción/log, así que su `timeout` debe
 * ser mayor o igual al de dedup. Se deriva del bound de dedup, nunca se
 * duplica, para que "igual-o-más-amplio" sea estructural (DD3, diseño M4).
 */
export const INGESTA_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: DEDUPLICACION_TRANSACTION_BOUNDS.maxWait,
  timeout: DEDUPLICACION_TRANSACTION_BOUNDS.timeout + 10_000,
};

/**
 * Límites de la transacción de `leads.service`/`formularios.service` (M5,
 * DD4): validar acceso → validar formulario → calcular → escribir
 * `respuestas_formulario` → actualizar `Lead` → escribir `lead_eventos`, todo
 * en una sola transacción interactiva. NO se deriva de
 * `DEDUPLICACION_TRANSACTION_BOUNDS`/`INGESTA_TRANSACTION_BOUNDS` (a
 * diferencia de `INGESTA_TRANSACTION_BOUNDS`) porque las transacciones de M5
 * nunca anidan con las de M3/M4 — son un flujo de escritura independiente.
 */
export const GESTION_LEAD_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `asignacion.service` (M6, D11): independiente
 * — no se deriva de dedup/ingesta/gestión de leads, igual que
 * `GESTION_LEAD_TRANSACTION_BOUNDS` y por la misma razón (flujo de escritura
 * propio: `asignar`/`reasignar`/`traspasar` abren su propia transacción). La
 * asignación automática (D1) NUNCA usa este bound — recibe el `tx` vivo de
 * `INGESTA_TRANSACTION_BOUNDS` por parámetro.
 */
export const ASIGNACION_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `citas.service` (M7): independiente, mismo
 * criterio que `ASIGNACION_TRANSACTION_BOUNDS` — agendar/reprogramar una cita
 * es un flujo de escritura propio que nunca anida con dedup/ingesta/gestión
 * de leads/asignación.
 */
export const CITAS_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `bridge.service.ts` (m4-bridges-crud-fundacion,
 * PR2): independiente, mismo criterio que `CITAS_TRANSACTION_BOUNDS` — la
 * decisión de borrado (`deleteBridge`) es un flujo de escritura propio que
 * nunca anida con dedup/ingesta/gestión de leads/asignación/citas.
 */
export const BRIDGE_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `usuarios.service::deactivateUsuario` (M2,
 * baja lógica con reasignación obligatoria de cartera activa): independiente,
 * mismo criterio que `BRIDGE_TRANSACTION_BOUNDS` — la baja de un usuario es
 * un flujo de escritura propio que nunca anida con dedup/ingesta/gestión de
 * leads/asignación/citas/bridges, aunque REUSA `applyAsignacion` de
 * `asignacion.service.ts` dentro de su propia transacción.
 */
export const USUARIOS_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción del encolado durable de recepción
 * (`ingesta.service.ts::ingestarLead`, `meta-webhook.service.ts::
 * encolarLeadgenMeta`, D2 gap closure): ambos son el mismo tipo de operación
 * (un único `INSERT ... ON CONFLICT DO UPDATE` idempotente sobre
 * `leads_recibidos`, sin ningún otro I/O dentro de la transacción), así que
 * comparten este bound — a diferencia de `INGESTA_TRANSACTION_BOUNDS`
 * (`procesarRecepcion`, que además hace dedupe/asignación/notificaciones y
 * por eso tiene un `timeout` mayor). Mismo criterio numérico que
 * `AUTH_BOOTSTRAP_TRANSACTION_BOUNDS` (una sola sentencia acotada por índice).
 */
export const INGESTA_ACCEPT_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción del worker de ingesta durable
 * (`jobs/ingesta-inbox.job.ts::runIngestionOnce`, D2 gap closure): envuelve
 * cada llamada individual a `claimNext`/`marcarFallo` (raw queries sueltas
 * sobre `leads_recibidos`) para que `applyTenantGucs` corra dentro de la
 * transacción holding-wide (`empresaId: null`, D3) que activa
 * `runWithTenantContext` alrededor de todo `runIngestionOnce` — el worker
 * reclama filas de CUALQUIER empresa (la cola es compartida), así que nunca
 * usa `crm_bypass_jobs` (D1: ese rol es `READ ONLY`, `claimNext`/
 * `marcarFallo` hacen `UPDATE`) — usa el mismo mecanismo holding-wide del
 * rol `crm_app` que ya usa `procesarNotificacionMeta`/`procesarRecepcion`.
 */
export const INGESTA_WORKER_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `withBootstrapUsuarioGuc` (D2 gap closure,
 * batch 3 discovery): corre en CADA request autenticado (hot path), mismo
 * criterio numérico que el resto (10s/20s) por consistencia, aunque en la
 * práctica es una sola `findMany` acotada por `@@index([usuarioId, activa])`
 * — nunca debería acercarse a estos límites.
 */
export const AUTH_BOOTSTRAP_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Límites de la transacción de `verificacion-token.service.ts::
 * produceAlertaTokenPorExpirar` (batch 3 discovery): mismo criterio que
 * `ASIGNACION_TRANSACTION_BOUNDS` (`sla-atrasado.service.ts`) — un job
 * programado (`jobs/verificacion-token.job.ts`) que corre sin
 * `AsyncLocalStorage` de tenant y necesita ver cuentas publicitarias por
 * expirar de TODAS las empresas (spec §2, "Approved job crosses companies"),
 * vía `runAsBypassJob` — nunca alcanzable desde un camino HTTP.
 */
export const VERIFICACION_TOKEN_TRANSACTION_BOUNDS: TransactionBounds = {
  maxWait: 10_000,
  timeout: 20_000,
};

/**
 * Seam D1 (diseño M4, DD1c): si el llamador ya trae una transacción externa
 * (`txExterna`), `fn` corre dentro de ella y `bounds` se ignora — nunca se
 * abre una segunda transacción/conexión (precondición de DD2). Si no,
 * `runInTransaction` abre su propia `prisma.$transaction` con `bounds`,
 * igual que antes de este seam (comportamiento por defecto preservado).
 */
export async function runInTransaction<T>(
  txExterna: Prisma.TransactionClient | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  bounds: TransactionBounds,
): Promise<T> {
  if (txExterna !== undefined) {
    return fn(txExterna);
  }
  return prisma.$transaction(fn, bounds);
}
