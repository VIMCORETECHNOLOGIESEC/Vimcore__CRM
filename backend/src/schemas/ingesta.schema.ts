import { z } from "zod";

/**
 * Payload de `POST /api/v1/ingesta/generico` (docs/05-bridges.md §5): el
 * mismo endpoint sirve a Google Forms hoy y a X/sitio propio a futuro, sin
 * trabajo adicional. Zod valida en el borde (AGENTS.md §4.4, "nunca confiar
 * en el payload de un webhook") antes de que el adaptador lo traduzca a
 * `LeadEntrante`. Los campos fijos conocidos se validan por nombre;
 * `camposDinamicos` es el resto del formulario y no se restringe, porque
 * cada plataforma define sus propios campos libres.
 *
 * Un campo fijo ausente u omitido llega como `null`, nunca `""` — mismo
 * principio de "sin valor por defecto inventado" del contrato `LeadEntrante`
 * (Requirement: LeadEntrante contract).
 */
export const ingestaGenericaSchema = z.object({
  idExternoLead: z.string().trim().min(1),
  nombre: z.string().trim().min(1).nullable().default(null),
  telefono: z.string().trim().min(1).nullable().default(null),
  correo: z.string().trim().min(1).nullable().default(null),
  idExternoCampania: z.string().trim().min(1).nullable().default(null),
  nombreCampania: z.string().trim().min(1).nullable().default(null),
  idExternoCuenta: z.string().trim().min(1).nullable().default(null),
  // Marca de tiempo de la plataforma de origen; si el bridge no la envía,
  // el adaptador usa el momento de recepción del servidor.
  ingresadoEn: z.coerce.date().optional(),
  camposDinamicos: z.record(z.string(), z.unknown()).default({}),
});

export type IngestaGenericaBody = z.infer<typeof ingestaGenericaSchema>;
