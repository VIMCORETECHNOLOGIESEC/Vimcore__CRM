import { EstadoBridge, NivelBridgeLog, RedSocial } from "@prisma/client";
import { z } from "zod";

import type { CampoLeadMapeable } from "../types/bridgeApi/configuracion-bridge-api.js";

const CAMPOS_LEAD_MAPEABLES = [
  "nombre",
  "telefono",
  "correo",
  "idExternoLead",
  "idExternoCampania",
  "nombreCampania",
  "idExternoCuenta",
] as const satisfies readonly CampoLeadMapeable[];

/**
 * bridgeApi (`RedSocial.API_EXTERNA`): usado por `mapeoBridgeApiBodySchema`
 * (`PATCH /bridges/:id/api-externa/mapeo`). Debe mapear al menos una clave
 * externa a `idExternoLead` — sin eso `LeadRecibido` no puede aplicar su
 * `UNIQUE(bridgeId, idExternoLead)` y cada poll duplicaría leads.
 */
const mapeoCamposSchema = z
  .record(z.string().trim().min(1), z.enum(CAMPOS_LEAD_MAPEABLES))
  .refine(
    (mapeo) => Object.values(mapeo).includes("idExternoLead"),
    "mapeoCampos debe mapear al menos una clave externa a idExternoLead",
  );

// D-M4-fundacion (diseño m4-bridges-crud-fundacion): Zod 4.4.3, mismo patrón
// que `usuarios.schema.ts` (formatos top-level, enum nativo de Prisma como
// valor en runtime).
// Bloque C (D4, Fase 2/Stage 2 — cutover bloqueante): `Bridge.empresaId` es
// NOT NULL (`schema.prisma`) — un bridge nunca se crea sin empresa asignada.
// Fix (bug de seguridad, empresaId forzado por sesión): `empresaId` opcional
// en el BODY -- una sesión company-scoped la deriva de su propio actor
// (`bridge.service.ts::resolveEmpresaId`, el body se ignora si lo manda); una
// sesión holding-wide sigue debiendo traerla explícita, o el service rechaza
// con 400 `empresa_requerida`.
// bridgeApi (RedSocial.API_EXTERNA): la configuración (conexión + mapeo) NO
// entra por acá — se carga después de crear el bridge, vía
// `PATCH /bridges/:id/api-externa/conexion` y `.../mapeo` (mismo patrón que
// Meta: `POST /bridges` crea el bridge desnudo, `POST .../cuentas/:id/token`
// carga la credencial después).
export const createBridgeBodySchema = z.object({
  redSocial: z.enum(RedSocial),
  nombre: z.string().trim().min(1).max(120),
  empresaId: z.uuid().optional(),
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
 * `GET /bridges` (fix, GET /bridges no pagina ni filtra): mismo patrón que
 * `usuarios.schema.ts::listUsuariosQuerySchema` — `pagina`/`limite` con
 * idénticos defaults/topes (1..∞ / 1..100, default 20), `busqueda` de texto
 * libre (filtra por `nombre` en `bridge.service.ts`, ILIKE insensible), y
 * `redSocial`/`estado` como enums nativos de Prisma para filtro exacto.
 */
export const listBridgesQuerySchema = z.object({
  busqueda: z.string().trim().min(1).optional(),
  redSocial: z.enum(RedSocial).optional(),
  estado: z.enum(EstadoBridge).optional(),
  // Fix (bug de seguridad, scope por empresa): mismo criterio de 3 ramas que
  // `negociacion/producto.schema.ts::listProductosQuerySchema` -- opcional
  // porque solo tiene efecto para una sesión holding-wide (drill-down a UNA
  // empresa puntual, `EmpresaDetallePage` del frontend); una sesión
  // company-scoped lo ignora por completo (`bridge.service.ts::
  // buildBridgeWhere` fuerza su propia empresa sin importar este valor).
  empresaId: z.uuid().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

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

/**
 * bridgeApi (`PATCH /bridges/:id/api-externa/conexion`): url + credencial en
 * texto plano + nombre de header, todo modificable las veces que haga falta
 * (ej. se configuró mal y hay que corregirlo) — mismo criterio idempotente
 * que `updateBridgeBodySchema`. `credencialExterna` se cifra en
 * `services/bridgeApi/configuracion.service.ts` antes de persistir, igual
 * que `cargarTokenBodySchema` con el token de Meta — nunca en claro, nunca
 * sale por la respuesta.
 */
export const conexionBridgeApiBodySchema = z.object({
  url: z.string().trim().pipe(z.url()),
  credencialExterna: z.string().trim().min(1),
  nombreHeaderApiKey: z.string().trim().min(1).optional(),
});

/**
 * bridgeApi (`PATCH /bridges/:id/api-externa/mapeo`): mapeo de campos +
 * parámetro de fecha, modificable las veces que haga falta.
 */
export const mapeoBridgeApiBodySchema = z.object({
  mapeoCampos: mapeoCamposSchema,
  parametroFecha: z.string().trim().min(1).optional(),
});

export type CreateBridgeBody = z.infer<typeof createBridgeBodySchema>;
export type UpdateBridgeBody = z.infer<typeof updateBridgeBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type ListBridgesQuery = z.infer<typeof listBridgesQuerySchema>;
export type LogsQuery = z.infer<typeof logsQuerySchema>;
export type CreateCuentaPublicitariaBody = z.infer<typeof createCuentaPublicitariaBodySchema>;
export type UpdateCuentaPublicitariaBody = z.infer<typeof updateCuentaPublicitariaBodySchema>;
export type BridgeCuentaParams = z.infer<typeof bridgeCuentaParamsSchema>;
export type CargarTokenBody = z.infer<typeof cargarTokenBodySchema>;
export type ConexionBridgeApiBody = z.infer<typeof conexionBridgeApiBodySchema>;
export type MapeoBridgeApiBody = z.infer<typeof mapeoBridgeApiBodySchema>;
