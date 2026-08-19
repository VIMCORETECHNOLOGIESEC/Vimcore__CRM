import type { RedSocial } from "@prisma/client";
import type { MetaFieldDatum, MetaLeadgenDetalle } from "../schemas/meta-webhook.schema.js";
import type { LeadEntrante } from "../types/lead-entrante.js";

const CAMPO_NOMBRE_COMPLETO = "full_name";
const CAMPO_NOMBRE_PILA = "first_name";
const CAMPO_APELLIDO = "last_name";
const CAMPO_CORREO = "email";
const CAMPO_TELEFONO = "phone_number";

const CAMPOS_FIJOS_CONSUMIDOS = new Set([
  CAMPO_NOMBRE_COMPLETO,
  CAMPO_NOMBRE_PILA,
  CAMPO_APELLIDO,
  CAMPO_CORREO,
  CAMPO_TELEFONO,
]);

function indexByName(fieldData: MetaFieldDatum[]): Map<string, MetaFieldDatum> {
  return new Map(fieldData.map((campo) => [campo.name.toLowerCase(), campo] as const));
}

function firstValue(campo: MetaFieldDatum | undefined): string | null {
  const valor = campo?.values[0];
  return valor === undefined || valor === "" ? null : valor;
}

function resolveNombre(porNombre: Map<string, MetaFieldDatum>): string | null {
  const completo = firstValue(porNombre.get(CAMPO_NOMBRE_COMPLETO));
  if (completo !== null) return completo;

  const nombrePila = firstValue(porNombre.get(CAMPO_NOMBRE_PILA));
  const apellido = firstValue(porNombre.get(CAMPO_APELLIDO));
  if (nombrePila === null && apellido === null) return null;
  return [nombrePila, apellido].filter((parte): parte is string => parte !== null).join(" ");
}

/**
 * Traduce la respuesta de `GET /{leadgen_id}?fields=field_data,ad_id,form_id,
 * campaign_name,ad_name,campaign_id` (docs/05-bridges.md §3) al contrato
 * interno `LeadEntrante`. Los nombres de campo estándar de Meta Lead Ads
 * (`full_name`/`first_name`+`last_name`, `email`, `phone_number`) se mapean a
 * los campos fijos; cualquier otro campo del formulario (campos custom) cae
 * en `camposDinamicos` sin traducción — mismo principio que
 * `google-forms.adapter.ts`, "sin valor por defecto inventado".
 *
 * `idExternoCampania` se mapea desde `campaign_id` (2026-08-18: agregado a la
 * consulta de detalle tras confirmar que Graph API lo expone como field
 * disponible en `GET /{leadgen_id}` — decisión de usuario, reemplaza la
 * ambigüedad reportada previamente cuando solo se pedía `campaign_name`).
 * `null` únicamente si Graph API no lo devuelve para ese lead en particular.
 *
 * `redSocial` la resuelve el llamador (`meta-webhook.service.ts`) a partir
 * del `Bridge` dueño de la `CuentaPublicitaria` (Página) que recibió el
 * webhook — Meta no expone un campo `platform` que distinga Facebook de
 * Instagram (docs/05-bridges.md §3), así que este adaptador nunca lo intenta
 * derivar por sí mismo.
 */
export function adaptMeta(
  detalle: MetaLeadgenDetalle,
  bridgeId: string,
  idExternoCuenta: string,
  redSocial: RedSocial,
  recibidoEn: Date = new Date(),
): LeadEntrante {
  const fieldData = detalle.field_data ?? [];
  const porNombre = indexByName(fieldData);

  const camposDinamicos: Record<string, unknown> = {};
  for (const campo of fieldData) {
    if (!CAMPOS_FIJOS_CONSUMIDOS.has(campo.name.toLowerCase())) {
      camposDinamicos[campo.name] = campo.values;
    }
  }
  if (detalle.ad_id !== undefined) camposDinamicos.adId = detalle.ad_id;
  if (detalle.form_id !== undefined) camposDinamicos.formId = detalle.form_id;
  if (detalle.ad_name !== undefined) camposDinamicos.adName = detalle.ad_name;

  return {
    redSocial,
    bridgeId,
    nombre: resolveNombre(porNombre),
    telefono: firstValue(porNombre.get(CAMPO_TELEFONO)),
    correo: firstValue(porNombre.get(CAMPO_CORREO)),
    idExternoLead: detalle.id,
    idExternoCampania: detalle.campaign_id ?? null,
    nombreCampania: detalle.campaign_name ?? null,
    idExternoCuenta,
    camposDinamicos,
    ingresadoEn: detalle.created_time !== undefined ? new Date(detalle.created_time) : recibidoEn,
    payloadOriginal: detalle,
  };
}
