import { EtapaLead, FormaPago, RedSocial, Semaforo } from "@prisma/client";
import { z } from "zod";

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
  // Filtro explícito por responsable operativo, solo útil para
  // Admin/Supervisor (D4) — para Asesor/Vendedor el where de rol ya acota.
  responsableId: z.uuid().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  estadoSla: z.enum(ESTADOS_SLA).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  // spec: "orden por al menos ingresadoEn" — único campo ordenable del MVP.
  direccion: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * spec ("Recalificación sin cambio de etapa", D16): solo `respuestas` — la
 * etapa la determina el lead actual en el servidor, nunca el body.
 */
export const postFormularioBodySchema = z.object({
  respuestas: z.record(z.string(), z.string()),
});

export type PatchEtapaBody = z.infer<typeof patchEtapaBodySchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type PostFormularioBody = z.infer<typeof postFormularioBodySchema>;
