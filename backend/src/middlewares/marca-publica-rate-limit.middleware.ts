import rateLimit from "express-rate-limit";

/**
 * PASO 5 (tema-empresarial-integracion): mitigación estándar para el único
 * endpoint público (sin `requireAuthentication`) de todo el backend --
 * `GET /marca-publica`. No es un sistema de rate-limiting general del
 * proyecto, así que se monta EXCLUSIVAMENTE en esa ruta (ver
 * `routes/marca-publica.routes.ts`), nunca globalmente en `app.ts`.
 *
 * 60 peticiones/minuto por IP: generoso para el uso real (un fetch por boot
 * de la SPA/login, ver `AppBoot.tsx`/`LoginPage.tsx`), suficiente para frenar
 * abuso trivial sin necesitar afinación fina.
 */
export const marcaPublicaRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
