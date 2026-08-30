import { z } from "zod";

export const linkedinFuenteParamsSchema = z.object({
  id: z.uuid(),
  fuenteId: z.uuid(),
});

export const linkedinFuentesParamsSchema = z.object({ id: z.uuid() });

export const updateLinkedInFuenteBodySchema = z.object({
  activa: z.boolean(),
});

export type LinkedInFuenteParams = z.infer<typeof linkedinFuenteParamsSchema>;
export type LinkedInFuentesParams = z.infer<typeof linkedinFuentesParamsSchema>;
export type UpdateLinkedInFuenteBody = z.infer<typeof updateLinkedInFuenteBodySchema>;
