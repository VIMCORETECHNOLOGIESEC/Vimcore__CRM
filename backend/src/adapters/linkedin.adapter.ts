import type {
  LinkedInLeadAnswer,
  LinkedInLeadFormResponseBody,
} from "../schemas/linkedin/linkedin-leads.schema.js";
import type { LeadEntrante } from "../types/lead-entrante.js";

const PREDEFINED_FIRST_NAME = "FIRST_NAME";
const PREDEFINED_LAST_NAME = "LAST_NAME";
const PREDEFINED_EMAIL = "EMAIL";
const PREDEFINED_PHONE_NUMBER = "PHONE_NUMBER";

function ownerUrnFrom(owner: LinkedInLeadFormResponseBody["owner"]): string | null {
  if (typeof owner === "string") return owner;
  return owner.organization ?? owner.sponsoredAccount ?? owner.urn ?? owner.id ?? null;
}

function stringAnswerValue(answer: LinkedInLeadAnswer): string | null {
  if (typeof answer.answer === "string" && answer.answer.trim() !== "") return answer.answer;
  const primerString = answer.answers?.find(
    (valor): valor is string => typeof valor === "string" && valor.trim() !== "",
  );
  return primerString ?? null;
}

function questionKey(answer: LinkedInLeadAnswer, index: number): string {
  return answer.questionId !== undefined ? String(answer.questionId) : `respuesta_${index}`;
}

/**
 * Traduce `GET /leadFormResponses/{id}` (Lead Sync API) al contrato interno
 * `LeadEntrante`.
 *
 * DECISIÓN DE SCOPE DELIBERADA (2026-08-31, no reabrir sin evidencia nueva
 * de la doc de LinkedIn): a diferencia de Meta (`meta.adapter.ts`, que
 * identifica campos fijos por NOMBRE — `full_name`/`email`/`phone_number`),
 * LinkedIn identifica el campo fijo de una respuesta por
 * `answer.predefinedField` (`FIRST_NAME`/`LAST_NAME`/`EMAIL`/
 * `PHONE_NUMBER`), pero esa doc confirma que ese mapeo "real" vive en la
 * DEFINICIÓN del formulario (`GET /leadForms/{id}`, un segundo llamado que
 * HOY no está integrado a este flujo) — la respuesta de
 * `/leadFormResponses/{id}` no garantiza traer `predefinedField` inline en
 * cada respuesta. Adivinar la posición de un `answer` para asignarlo a
 * `telefono`/`correo` sería peor que dejarlo `null`: un dato incorrecto en
 * el CRM, no un dato ausente (mismo principio que `LeadEntrante`, "un campo
 * que no se puede llenar es null, nunca un valor por defecto inventado").
 *
 * Por eso: `nombre`/`telefono`/`correo` quedan `null` salvo que
 * `answer.predefinedField` SÍ venga inline en la respuesta (el schema lo
 * permite opcional, y algunas respuestas de LinkedIn lo incluyen) — en ese
 * caso se mapea oportunistamente. TODAS las respuestas (`formResponse.
 * answers`, indexadas por `questionId`) van además a `camposDinamicos` sin
 * traducir. Mapear con precisión vía la definición completa del formulario
 * es una mejora futura documentada, no un TODO suelto de esta tarea.
 */
export function adaptLinkedIn(
  detalle: LinkedInLeadFormResponseBody,
  bridgeId: string,
  idExternoLead: string,
): LeadEntrante {
  const answers = detalle.formResponse.answers;
  const camposDinamicos: Record<string, unknown> = {};

  let nombrePila: string | null = null;
  let apellido: string | null = null;
  let correo: string | null = null;
  let telefono: string | null = null;

  for (const [index, answer] of answers.entries()) {
    const valor = stringAnswerValue(answer);
    switch (answer.predefinedField) {
      case PREDEFINED_FIRST_NAME:
        nombrePila = valor;
        break;
      case PREDEFINED_LAST_NAME:
        apellido = valor;
        break;
      case PREDEFINED_EMAIL:
        correo = valor;
        break;
      case PREDEFINED_PHONE_NUMBER:
        telefono = valor;
        break;
      default:
        break;
    }
    camposDinamicos[questionKey(answer, index)] = answer;
  }

  const partesNombre = [nombrePila, apellido].filter((parte): parte is string => parte !== null);
  const nombre = partesNombre.length > 0 ? partesNombre.join(" ") : null;

  return {
    redSocial: "LINKEDIN",
    bridgeId,
    nombre,
    telefono,
    correo,
    idExternoLead,
    idExternoCampania: detalle.leadMetadataInfo?.campaignUrn ?? null,
    nombreCampania: detalle.leadMetadataInfo?.campaignName ?? null,
    idExternoCuenta: ownerUrnFrom(detalle.owner),
    camposDinamicos,
    ingresadoEn: detalle.submittedAt,
    payloadOriginal: detalle,
  };
}
