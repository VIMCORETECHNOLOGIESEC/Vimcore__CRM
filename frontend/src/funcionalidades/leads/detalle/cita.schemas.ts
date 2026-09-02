import { z } from "zod";

import { DURACION_MINIMA_CITA_MINUTOS, hasDuracionMinima } from "@/funcionalidades/citas/citas.utils";

/**
 * Validación del panel de citas (docs/07 F4, "agendar no permite fecha
 * pasada"). `programadaPara`/`finalizaEn` viajan como strings locales desde
 * los controles de fecha/hora; se comparan contra `new Date()` al validar.
 */
const citaDateTimeFields = {
  programadaPara: z
    .string()
    .min(1, "La fecha y hora son obligatorias")
    .refine((valor) => new Date(valor).getTime() > Date.now(), {
      message: "No se puede agendar una cita en una fecha ya pasada",
    }),
  finalizaEn: z.string().trim().optional(),
};

function validarDuracionMinima(
  valor: { programadaPara: string; finalizaEn?: string },
  contexto: z.RefinementCtx,
) {
  if (!valor.finalizaEn) return;
  if (!hasDuracionMinima(valor.programadaPara, valor.finalizaEn)) {
    contexto.addIssue({
      code: "custom",
      path: ["finalizaEn"],
      message: `La duración mínima de una cita es de ${DURACION_MINIMA_CITA_MINUTOS} minutos`,
    });
  }
}

export const citaScheduleSchema = z.object({
  ...citaDateTimeFields,
  modalidad: z.enum(["PRESENCIAL", "VIRTUAL", "TELEFONICA"]),
  notas: z.string().trim().optional(),
}).superRefine(validarDuracionMinima);

export type CitaScheduleFormValues = z.infer<typeof citaScheduleSchema>;

export const citaRescheduleSchema = z.object(citaDateTimeFields).superRefine(validarDuracionMinima);

export type CitaRescheduleFormValues = z.infer<typeof citaRescheduleSchema>;
