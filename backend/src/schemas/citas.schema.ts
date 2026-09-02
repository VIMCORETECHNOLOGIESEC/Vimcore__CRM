import { ModalidadCita } from "@prisma/client";
import { z } from "zod";

export const citaIdParamSchema = z.object({ citaId: z.uuid() });

/** Duración mínima de una cita — mismo umbral que el `CHECK` de la BD (`citas_duracion_minima`, ver `migration.sql`), defensa en profundidad. */
const DURACION_MINIMA_MS = 60 * 60 * 1000;

/**
 * `programadaPara` en el pasado se rechaza en el servicio (`citas.service.ts`),
 * nunca solo aquí — el reloj de referencia es el del servidor al momento de
 * la escritura, no el instante de parseo del body (AGENTS.md §4: Zod valida
 * forma/tipo en el borde; las reglas de negocio con estado — "en el futuro
 * respecto a AHORA" — viven en el service).
 *
 * Vista de calendario (feature aditiva post-M7): `finalizaEn` es fin
 * explícito de la cita, en vez de derivarlo implícito de `programadaPara` —
 * ver comentario del campo en `schema.prisma`. `superRefine` exige al menos
 * 1h de duración — mismo umbral que el `CHECK` de BD `citas_duracion_minima`,
 * chequeado acá primero para dar un error de validación claro en el borde en
 * vez de dejar que la escritura llegue a fallar en la BD.
 */
export const crearCitaBodySchema = z
  .object({
    programadaPara: z.coerce.date(),
    finalizaEn: z.coerce.date(),
    modalidad: z.enum(ModalidadCita),
    notas: z.string().trim().min(1).optional(),
    // Solo Admin/Supervisor pueden agendar a nombre de otro usuario
    // (`citas.service.ts::resolveResponsable`, D-M7a) — el schema no conoce el
    // rol del actor, esa regla vive en el servicio.
    usuarioId: z.uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.finalizaEn.getTime() - data.programadaPara.getTime() < DURACION_MINIMA_MS) {
      ctx.addIssue({
        code: "custom",
        message: "La cita debe durar al menos 1 hora (finalizaEn debe ser posterior a programadaPara + 1h)",
        path: ["finalizaEn"],
      });
    }
  });

/** Mismo criterio de duración mínima que `crearCitaBodySchema` de arriba. */
export const reprogramarCitaBodySchema = z
  .object({
    programadaPara: z.coerce.date(),
    finalizaEn: z.coerce.date(),
  })
  .superRefine((data, ctx) => {
    if (data.finalizaEn.getTime() - data.programadaPara.getTime() < DURACION_MINIMA_MS) {
      ctx.addIssue({
        code: "custom",
        message: "La cita debe durar al menos 1 hora (finalizaEn debe ser posterior a programadaPara + 1h)",
        path: ["finalizaEn"],
      });
    }
  });

export const marcarResultadoCitaBodySchema = z.object({
  estado: z.enum(["CUMPLIDA", "NO_ASISTIO"]),
});

/**
 * `GET /citas` (vista de calendario, feature aditiva post-M7):
 * `desde`/`hasta` son el rango de fechas visible del calendario -- a
 * diferencia de `listLeadsQuerySchema.hasta` (que normaliza un `hasta` de
 * solo-fecha a fin de día UTC), acá se esperan instantes completos que ya
 * trae el propio calendario del frontend, no fechas sueltas -- por eso NO
 * se les aplica `finDiaUTC`. `empresaId` opcional: mismo criterio de
 * drill-down holding-wide que `listConversacionesQuerySchema`/
 * `listLeadsQuerySchema` (`leads.access.ts::aplicarFiltroEmpresa`) --
 * decisión propia, no estaba en la lista literal de query params de la
 * tarea, pero sin él una sesión holding-wide "en vista de empresa" no
 * podría acotar el calendario a una sola empresa (ver
 * `citas.service.ts::listCitas`).
 */
export const listCitasQuerySchema = z
  .object({
    desde: z.coerce.date(),
    hasta: z.coerce.date(),
    asesorId: z.uuid().optional(),
    empresaId: z.uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.hasta.getTime() < data.desde.getTime()) {
      ctx.addIssue({ code: "custom", message: "hasta debe ser posterior o igual a desde", path: ["hasta"] });
    }
  });

export type CrearCitaBody = z.infer<typeof crearCitaBodySchema>;
export type ReprogramarCitaBody = z.infer<typeof reprogramarCitaBodySchema>;
export type MarcarResultadoCitaBody = z.infer<typeof marcarResultadoCitaBodySchema>;
export type CitaIdParam = z.infer<typeof citaIdParamSchema>;
export type ListCitasQuery = z.infer<typeof listCitasQuerySchema>;
