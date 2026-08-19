import { NivelBridgeLog, RedSocial } from "@prisma/client";
import { z } from "zod";

// D-M4-fundacion (diseño m4-bridges-crud-fundacion): Zod 4.4.3, mismo patrón
// que `usuarios.schema.ts` (formatos top-level, enum nativo de Prisma como
// valor en runtime).
export const createBridgeBodySchema = z.object({
  redSocial: z.enum(RedSocial),
  nombre: z.string().trim().min(1).max(120),
});

/**
 * Requirement: PATCH /bridges/:id es el único endpoint para rename/
 * deactivate/reactivate. `estado` se restringe a `ACTIVO|INACTIVO` — nunca
 * los valores system-authored `TOKEN_EXPIRADO`/`ERROR` (diseño DD "single
 * PATCH..."), que quedan fuera del enum aceptado y por lo tanto rechazados
 * con 400 por Zod, sin que el servicio tenga que revalidarlos.
 */
export const updateBridgeBodySchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export const idParamSchema = z.object({ id: z.uuid() });

/**
 * `GET /bridges/:id/logs` (diseño m4-bridges-crud-fundacion, DD "log reads
 * are capped server-side"): el schema solo valida FORMA/tipos — el default
 * 100 y el cap duro 500 se resuelven en `bridge.service.ts::resolveLimiteLogs`,
 * nunca acá, para que exista una única fuente de verdad sobre el clamp.
 */
export const logsQuerySchema = z.object({
  nivel: z.enum(NivelBridgeLog).optional(),
  fechaDesde: z.coerce.date().optional(),
  fechaHasta: z.coerce.date().optional(),
  limite: z.coerce.number().int().positive().optional(),
});

/**
 * Requirement: Admin can manually create a CuentaPublicitaria. `idExterno` es
 * obligatorio (Requirement: Instagram id alone is not accepted as the row's
 * identity — el Page id sigue siendo la identidad de la fila).
 * `instagramAccountId` es el nombre de contrato público de la cuenta de
 * Instagram vinculada (Prisma: `idExternoVinculado`) — texto libre sin
 * validar en esta rebanada porque no existe adaptador Meta todavía para
 * cruzar Page↔Instagram (diseño, Open Questions: resuelto como
 * "accepted-but-unvalidated").
 */
export const createCuentaPublicitariaBodySchema = z.object({
  idExterno: z.string().trim().min(1),
  nombre: z.string().trim().min(1).max(120),
  instagramAccountId: z.string().trim().min(1).optional(),
});

/** `PATCH /bridges/:id/cuentas/:cuentaId` (Requirement: PATCH toggles only activation) — solo `activa`. */
export const updateCuentaPublicitariaBodySchema = z.object({
  activa: z.boolean(),
});

export const bridgeCuentaParamsSchema = z.object({
  id: z.uuid(),
  cuentaId: z.uuid(),
});

/**
 * `POST /bridges/:id/cuentas/:cuentaId/token` (docs/05-bridges.md §7): un
 * solo campo, el Page Access Token en texto plano — nunca se persiste sin
 * pasar antes por `meta-token.service.ts::verificarTokenPagina` y
 * `lib/cifrado-token.ts::encrypt` (`cuenta-publicitaria.service.ts::
 * cargarToken`, la única capa que lo toca en texto plano).
 */
export const cargarTokenBodySchema = z.object({
  token: z.string().trim().min(1),
});

export type CreateBridgeBody = z.infer<typeof createBridgeBodySchema>;
export type UpdateBridgeBody = z.infer<typeof updateBridgeBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type LogsQuery = z.infer<typeof logsQuerySchema>;
export type CreateCuentaPublicitariaBody = z.infer<typeof createCuentaPublicitariaBodySchema>;
export type UpdateCuentaPublicitariaBody = z.infer<typeof updateCuentaPublicitariaBodySchema>;
export type BridgeCuentaParams = z.infer<typeof bridgeCuentaParamsSchema>;
export type CargarTokenBody = z.infer<typeof cargarTokenBodySchema>;
