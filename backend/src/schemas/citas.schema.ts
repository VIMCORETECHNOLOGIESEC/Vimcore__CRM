import { ModalidadCita } from "@prisma/client";
import { z } from "zod";

export const citaIdParamSchema = z.object({ citaId: z.uuid() });

/**
 * `programadaPara` en el pasado se rechaza en el servicio (`citas.service.ts`),
 * nunca solo aquí — el reloj de referencia es el del servidor al momento de
 * la escritura, no el instante de parseo del body (AGENTS.md §4: Zod valida
 * forma/tipo en el borde; las reglas de negocio con estado — "en el futuro
 * respecto a AHORA" — viven en el service).
 */
export const crearCitaBodySchema = z.object({
  programadaPara: z.coerce.date(),
  modalidad: z.enum(ModalidadCita),
  notas: z.string().trim().min(1).optional(),
  // Solo Admin/Supervisor pueden agendar a nombre de otro usuario
  // (`citas.service.ts::resolveResponsable`, D-M7a) — el schema no conoce el
  // rol del actor, esa regla vive en el servicio.
  usuarioId: z.uuid().optional(),
});

export const reprogramarCitaBodySchema = z.object({
  programadaPara: z.coerce.date(),
});

export const marcarResultadoCitaBodySchema = z.object({
  estado: z.enum(["CUMPLIDA", "NO_ASISTIO"]),
});

export type CrearCitaBody = z.infer<typeof crearCitaBodySchema>;
export type ReprogramarCitaBody = z.infer<typeof reprogramarCitaBodySchema>;
export type MarcarResultadoCitaBody = z.infer<typeof marcarResultadoCitaBodySchema>;
export type CitaIdParam = z.infer<typeof citaIdParamSchema>;
