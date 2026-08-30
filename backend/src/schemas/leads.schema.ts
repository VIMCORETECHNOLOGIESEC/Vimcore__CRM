import { EtapaLead, FormaPago, RedSocial, Semaforo } from "@prisma/client";
import { z } from "zod";
import { finDiaUTC } from "../lib/rango-fechas.js";

export const idParamSchema = z.object({ id: z.uuid() });

/**
 * DD7 (diseño M5): unión discriminada por `etapa` — "VENTA necesita
 * monto+producto+formaPago" y "NO_VENTA necesita ≥20 caracteres" son de
 * tipo, no cadenas de `if`. `cerradoEn` lo fija el servidor (D13); nunca
 * llega en el body. DD8: `z.object` descarta claves desconocidas, así un
 * `puntuacion`/`semaforo` inyectado en el body nunca llega al servicio (D7).
 */
export const patchEtapaBodySchema = z.discriminatedUnion("etapa", [
  z.object({
    etapa: z.literal("VENTA"),
    montoVenta: z.number().positive(),
    productoServicio: z.string().trim().min(1),
    formaPago: z.enum(FormaPago),
  }),
  z.object({
    etapa: z.literal("NO_VENTA"),
    observacionCierre: z.string().trim().min(20),
  }),
  z.object({
    etapa: z.enum(["NUEVO", "CONTACTADO", "CITA"]),
    // claveOpcion → claveOpcion elegida (config/formularios.ts).
    respuestas: z.record(z.string(), z.string()),
  }),
]);

const ESTADOS_SLA = ["a_tiempo", "en_riesgo", "atrasado", "sin_iniciar"] as const;

/**
 * M-hardening Bloque A (WU9, spec lead-listing, D8): whitelist explícita —
 * cualquier `limite` fuera de este conjunto se rechaza en vez de tolerarse
 * silenciosamente. Se mantiene `ListLeadsQuery["limite"]` inferido como
 * `number` plano (D8): narrowing a `10|25|50|100` rompería los fixtures
 * armados a mano de `leads.service.test.ts` (`limite: 20`) que bypasean el
 * schema intencionalmente, sin ganar seguridad real en runtime — el límite
 * ya se aplica en el borde (este `.refine`), no en el tipo.
 */
const LIMITES_PERMITIDOS = [10, 25, 50, 100] as const;

/**
 * spec ("Filtros, paginación y orden del listado"): DD5 — este schema NO
 * expone `asesorId`/`vendedorId`. `z.object` descarta cualquier clave
 * desconocida del query string, así un cliente que envíe `?asesorId=...`
 * (spec, "Query param no sobrescribe el filtro de rol") no tiene forma
 * estructural de llegar al `where` — el filtro de rol lo inyecta el
 * servicio desde `req.user`, nunca desde aquí.
 */
export const listLeadsQuerySchema = z.object({
  etapa: z.enum(EtapaLead).optional(),
  semaforo: z.union([z.enum(Semaforo), z.literal("sin_calificar")]).optional(),
  redSocial: z.enum(RedSocial).optional(),
  // DD2: texto libre contra `payload_original ->> 'nombreCampania'` (ILIKE).
  campania: z.string().trim().min(1).optional(),
  // spec ("Búsqueda libre sobre datos de cliente"): OR ILIKE sobre
  // cliente.nombre/telefonoOriginal/telefonoNormalizado/correo principal —
  // la campaña queda deliberadamente fuera (usa `campania` arriba).
  busqueda: z.string().trim().min(1).optional(),
  // Filtro explícito por responsable operativo, solo útil para
  // Admin/Supervisor (D4) — para Asesor/Vendedor el where de rol ya acota.
  responsableId: z.uuid().optional(),
  // M-hardening Bloque A (WU8, spec lead-listing): "activos" → cerradoEn
  // null; "cerrados" → cerradoEn no nulo; omitido → sin filtro (comportamiento
  // sin cambios).
  vista: z.enum(["activos", "cerrados"]).optional(),
  desde: z.coerce.date().optional(),
  // M-hardening Bloque A (WU6, spec lead-listing): un `hasta` de solo fecha
  // (p. ej. "2026-08-20") normaliza a fin de día UTC — mismo patrón
  // `finDiaUTC` que `metricas.schema.ts` — así un lead ingresado a las
  // 18:00 UTC ese mismo día queda incluido, en vez de excluido por comparar
  // contra medianoche.
  hasta: z.coerce
    .date()
    .optional()
    .transform((v) => (v === undefined ? undefined : finDiaUTC(v))),
  estadoSla: z.enum(ESTADOS_SLA).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce
    .number()
    .int()
    .refine((v) => (LIMITES_PERMITIDOS as readonly number[]).includes(v), {
      message: "limite debe ser 10, 25, 50 o 100",
    })
    .default(25),
  // spec: "orden por al menos ingresadoEn" — único campo ordenable del MVP.
  direccion: z.enum(["asc", "desc"]).default("desc"),
})
  // M-hardening Bloque A (WU6): `desde > hasta` es un rango vacío/inválido —
  // se rechaza explícitamente en vez de devolver una lista vacía silenciosa.
  // `.superRefine` convierte el schema en `ZodEffects` (pierde
  // `.shape`/`.extend`/`.partial`) — único consumidor verificado:
  // `listLeadsQuerySchema.safeParse` en `leads.controller.ts:36,:54`, ambos
  // sobreviven sin cambios.
  .superRefine((data, ctx) => {
    if (data.desde && data.hasta && data.desde > data.hasta) {
      ctx.addIssue({
        code: "custom",
        message: "desde no puede ser posterior a hasta",
        path: ["desde"],
      });
    }
    // D7 (WU8): `buildWhere` ya fuerza `cerradoEn = null` para `estadoSla`
    // (leads.service.ts) — `vista=cerrados` + `estadoSla` silenciosamente
    // devolvería leads abiertos, contradiciendo la intención del filtro. Se
    // rechaza explícito en vez de dejar que uno gane en silencio.
    if (data.vista === "cerrados" && data.estadoSla) {
      ctx.addIssue({
        code: "custom",
        message: "estadoSla solo aplica a leads activos",
        path: ["estadoSla"],
      });
    }
  });

/**
 * spec ("Recalificación sin cambio de etapa", D16): solo `respuestas` — la
 * etapa la determina el lead actual en el servidor, nunca el body.
 */
export const postFormularioBodySchema = z.object({
  respuestas: z.record(z.string(), z.string()),
});

/**
 * M6 (diseño, "Endpoints"): `z.object` descarta claves desconocidas (mismo
 * patrón DD8 de M5) — un `slaInicioEn`/`semaforo` inyectado en el body no
 * tiene forma estructural de llegar al servicio. `asesorId`/`vendedorId` solo
 * se leen del body cuando el actor es Administrador/Supervisor (DD10);
 * `leads.access.ts`/`asignacion.service.ts` deciden eso, no el schema.
 */
export const asignarBodySchema = z.object({ asesorId: z.uuid().optional() });
export const reasignarBodySchema = z.object({ asesorId: z.uuid().optional() });
export const traspasarBodySchema = z.object({ vendedorId: z.uuid().optional() });

/**
 * design D-A1 ("Tamaño máximo = 100"): derivado estructuralmente de
 * `listLeadsQuerySchema.limite.max(100)` arriba — así "seleccionar toda la
 * página visible" siempre cabe en un único request (decisión 2 del diseño:
 * un solo request, sin chunking en cliente). `asesorId` (no `responsableId`
 * del spec — el diseño lo corrige por simetría estructural con
 * `asignarBodySchema`, mismo pool ASESOR) es opcional: activa
 * `selectResponsable` por lead cuando se omite.
 */
export const asignarLoteBodySchema = z.object({
  leadIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "leadIds no debe contener duplicados"),
  asesorId: z.uuid().optional(),
});

export type PatchEtapaBody = z.infer<typeof patchEtapaBodySchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type PostFormularioBody = z.infer<typeof postFormularioBodySchema>;
export type AsignarBody = z.infer<typeof asignarBodySchema>;
export type ReasignarBody = z.infer<typeof reasignarBodySchema>;
export type TraspasarBody = z.infer<typeof traspasarBodySchema>;
export type AsignarLoteBody = z.infer<typeof asignarLoteBodySchema>;
