import { RolUsuario } from "@prisma/client";
import { z } from "zod";
import { passwordPolicySchema } from "schemas";

// Bloque C follow-up (D2 gap closure, spec "Request-scoped tenant context"):
// mismos dos roles holding-wide incondicionales que
// `require-authentication.middleware.ts::ROLES_ACCESO_TOTAL` — los únicos
// que NO necesitan `empresaId` al crearse (nunca resuelven TenantContext vía
// Membresia).
const ROLES_ACCESO_TOTAL = ["ADMINISTRADOR", "SUPERVISOR"] as const;

// Zod 4.4.3: formatos de string en el nivel superior (`z.email()`, `z.uuid()`).
// D9: exactamente los 4 roles del enum nativo de Prisma.
//
// Base sin `superRefine` (`usuarioBodyShapeSchema`, no exportado): la
// condicional `empresaId` depende de `rol` en el mismo body, pero
// `updateUsuarioBodySchema` abajo necesita `.partial()` sobre la FORMA, y
// `ZodObject.partial()` no existe sobre el `ZodEffects` que devuelve
// `.superRefine()`. `createUsuarioBodySchema` aplica el refine solo en la
// forma completa (alta); el PATCH parcial no reaplica esta regla — un PATCH
// que cambie `rol` a ASESOR/VENDEDOR sin `empresaId` no crea ninguna
// Membresia nueva (fuera de alcance de este follow-up, mismo criterio que
// el resto de `updateUsuario`: no reevalúa invariantes de alta).
const usuarioBodyShapeSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  // Sin `.toLowerCase()`: `correo` es `@db.Citext`, la comparación ya es
  // insensible a mayúsculas en la base de datos (mismo patrón que auth.schema.ts).
  correo: z.string().trim().pipe(z.email()),
  // Política de alta (docs/07 F2): mínimo 12 caracteres, único punto de
  // verdad compartido con el frontend en packages/schemas.
  password: passwordPolicySchema,
  rol: z.enum(RolUsuario),
  // Bloque C follow-up (D2 gap closure): obligatorio SOLO para
  // ASESOR/VENDEDOR — validado condicionalmente abajo (`superRefine`), no
  // acá, porque depende del valor de `rol` en el mismo body.
  empresaId: z.uuid().optional(),
});

export const createUsuarioBodySchema = usuarioBodyShapeSchema.superRefine((body, ctx) => {
  if (!ROLES_ACCESO_TOTAL.includes(body.rol as (typeof ROLES_ACCESO_TOTAL)[number]) && !body.empresaId) {
    ctx.addIssue({
      code: "custom",
      path: ["empresaId"],
      message: "empresaId es obligatorio para crear un usuario ASESOR o VENDEDOR",
    });
  }
});

/**
 * `activo` reactiva/desactiva por este mismo endpoint — mismo patrón que
 * `bridges.schema.ts::updateBridgeBodySchema` con `estado: "ACTIVO"`. Solo
 * fija el flag; NO restaura la cartera de leads redistribuida al dar de baja
 * (`usuarios.service.ts::deactivateUsuario`) — el usuario reactivado arranca
 * con cartera vacía y vuelve a recibir leads por asignación normal. Baja
 * lógica completa (revocación de refresh tokens + reasignación obligatoria
 * de cartera) sigue siendo exclusiva de `DELETE /usuarios/:id`
 * (`deactivateUsuario`), no de este PATCH.
 */
export const updateUsuarioBodySchema = usuarioBodyShapeSchema
  .partial()
  .extend({ activo: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Debes enviar al menos un campo");

export const idParamSchema = z.object({ id: z.uuid() });

/**
 * F7 (admin de usuarios): mismo patrón de `leads.schema.ts::listLeadsQuerySchema`
 * — `z.object` descarta claves desconocidas del query string, `pagina`/`limite`
 * comparten el mismo tope (100) que Leads. Orden por defecto: `creadoEn`, el
 * mismo campo que ya usaba `usuario.repository.findUsuarios` (`orderBy:
 * { creadoEn: "asc" }") antes de este cambio — no hay otro campo de fecha en
 * el modelo `Usuario` y cambiar el default de orden sería una regresión
 * silenciosa para el listado ya existente.
 */
export const listUsuariosQuerySchema = z.object({
  // Texto libre contra `nombre` O `correo` (ILIKE — ver `usuarios.service.ts`:
  // ambos campos necesitan `mode: "insensitive"` explícito en el `where`,
  // incluido `correo` pese a ser `@db.Citext`, porque `contains` de Prisma
  // sin `mode` no usa el camino que activa la insensibilidad de citext).
  busqueda: z.string().trim().min(1).optional(),
  rol: z.enum(RolUsuario).optional(),
  // `z.coerce.boolean()` NO sirve acá: `Boolean("false")` es `true` — un
  // `?activo=false` literal se leería como `true`. `z.enum` + `transform`
  // acepta solo los dos literales de texto que puede mandar un query string.
  activo: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  direccion: z.enum(["asc", "desc"]).default("asc"),
});

/**
 * F3/F4 (diseño D-A1, catálogo de responsables): `rol` es obligatorio — el
 * catálogo siempre se consulta acotado a un pool (ASESOR para asignación
 * individual/lote). Sin filtro por equipo (spec: "sin filtro por equipo").
 */
export const listResponsablesQuerySchema = z.object({
  rol: z.enum(RolUsuario),
});

export type CreateUsuarioBody = z.infer<typeof createUsuarioBodySchema>;
export type UpdateUsuarioBody = z.infer<typeof updateUsuarioBodySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type ListUsuariosQuery = z.infer<typeof listUsuariosQuerySchema>;
export type ListResponsablesQuery = z.infer<typeof listResponsablesQuerySchema>;
