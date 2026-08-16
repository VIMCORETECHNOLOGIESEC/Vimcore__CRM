import { z } from "zod";

/**
 * Validación del panel de citas (docs/07 F4, "agendar no permite fecha
 * pasada"). `programadaPara` viaja como `datetime-local` (string sin
 * timezone) desde el `<input type="datetime-local">`; se compara contra
 * `new Date()` al validar.
 */
export const citaScheduleSchema = z.object({
  programadaPara: z
    .string()
    .min(1, "La fecha y hora son obligatorias")
    .refine((valor) => new Date(valor).getTime() > Date.now(), {
      message: "No se puede agendar una cita en una fecha ya pasada",
    }),
  modalidad: z.enum(["PRESENCIAL", "VIRTUAL", "TELEFONICA"]),
  notas: z.string().trim().optional(),
});

export type CitaScheduleFormValues = z.infer<typeof citaScheduleSchema>;

export const citaRescheduleSchema = z.object({
  programadaPara: z
    .string()
    .min(1, "La fecha y hora son obligatorias")
    .refine((valor) => new Date(valor).getTime() > Date.now(), {
      message: "No se puede reprogramar a una fecha ya pasada",
    }),
});

export type CitaRescheduleFormValues = z.infer<typeof citaRescheduleSchema>;
