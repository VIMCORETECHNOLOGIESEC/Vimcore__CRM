import { EtapaLead } from "@prisma/client";
import { z } from "zod";

/** spec ("Definición de formulario por etapa"): valida el segmento `:etapa`. */
export const etapaParamSchema = z.object({ etapa: z.enum(EtapaLead) });

export type EtapaParam = z.infer<typeof etapaParamSchema>;
