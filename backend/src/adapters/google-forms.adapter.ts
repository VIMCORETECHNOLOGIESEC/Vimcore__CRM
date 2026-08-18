import type { IngestaGenericaBody } from "../schemas/ingesta.schema.js";
import type { LeadEntrante } from "../types/lead-entrante.js";

/**
 * Traduce el payload ya validado por `ingestaGenericaSchema` (el que el
 * Apps Script `onFormSubmit` de docs/05-bridges.md §6 envía a
 * `POST /api/v1/ingesta/generico`) al contrato interno `LeadEntrante`
 * (Requirement: Google Forms adapter). No hay traducción de nombres de
 * campo adicional: el schema genérico YA define la forma canónica que
 * cualquier bridge de este estilo (Google Forms hoy, X/sitio propio a
 * futuro) debe enviar — el Apps Script se escribe contra ese contrato.
 *
 * `redSocial`/`bridgeId` los resuelve el llamador (middleware de
 * autenticación, PR3b), no el adaptador. Un campo que Zod ya normalizó a
 * `null` por ausencia se propaga tal cual, nunca un placeholder
 * (Requirement: LeadEntrante contract, Scenario: Unfilled field is null).
 */
export function adaptGoogleForms(
  body: IngestaGenericaBody,
  bridgeId: string,
  recibidoEn: Date = new Date(),
): LeadEntrante {
  return {
    redSocial: "GOOGLE_FORMS",
    bridgeId,
    nombre: body.nombre,
    telefono: body.telefono,
    correo: body.correo,
    idExternoLead: body.idExternoLead,
    idExternoCampania: body.idExternoCampania,
    nombreCampania: body.nombreCampania,
    idExternoCuenta: body.idExternoCuenta,
    camposDinamicos: body.camposDinamicos,
    ingresadoEn: body.ingresadoEn ?? recibidoEn,
    payloadOriginal: body,
  };
}
