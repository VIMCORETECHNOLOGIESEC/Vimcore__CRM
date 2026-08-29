import { AppError } from "../../lib/app-error.js";
import { GRAPH_API_BASE_URL } from "../meta-webhook.service.js";
import {
  whatsappBusinessesRespuestaSchema,
  whatsappEnvioMensajeRespuestaSchema,
  whatsappOwnedWabaRespuestaSchema,
  whatsappPhoneNumbersRespuestaSchema,
} from "../../schemas/whatsappMessages/whatsapp-cloud-api.schema.js";
import type { WhatsAppNumeroDescubiertoDto } from "../../types/whatsappMessages/whatsapp-oauth.dto.js";

/**
 * Todas las llamadas de este archivo reusan `GRAPH_API_BASE_URL`
 * (`meta-webhook.service.ts`, ya soporta el override de QA local
 * `META_GRAPH_API_BASE_URL`) — mismo host de Graph API que el resto de la
 * integración Meta (Ads leadgen), WhatsApp Business Platform vive en la
 * misma API. Sin segmento de versión explícito en la URL, igual que
 * `meta-webhook.service.ts::consultarDetalleLead` — Graph API usa la
 * versión default configurada en el dashboard de la Meta App cuando no se
 * especifica una.
 */
function envioFallido(): AppError {
  return new AppError("whatsapp_envio_fallido", 502, "No se pudo enviar el mensaje de WhatsApp");
}

function descubrimientoFallido(): AppError {
  return new AppError(
    "whatsapp_descubrimiento_fallido",
    502,
    "No se pudo consultar los números de WhatsApp Business disponibles",
  );
}

export interface EnvioMensajeResultado {
  wamid: string;
}

/** `POST /{numero_telefono_id}/messages` — envío de un mensaje de texto saliente. */
export async function enviarMensajeTexto(
  numeroTelefonoId: string,
  tokenAcceso: string,
  destinatarioWaId: string,
  texto: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<EnvioMensajeResultado> {
  let cuerpo: unknown;
  let ok: boolean;
  try {
    const respuesta = await fetchFn(`${GRAPH_API_BASE_URL}/${encodeURIComponent(numeroTelefonoId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenAcceso}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destinatarioWaId,
        type: "text",
        text: { body: texto },
      }),
    });
    ok = respuesta.ok;
    cuerpo = await respuesta.json().catch(() => null);
  } catch {
    throw envioFallido();
  }
  if (!ok) throw envioFallido();

  const parsed = whatsappEnvioMensajeRespuestaSchema.safeParse(cuerpo);
  if (!parsed.success) throw envioFallido();

  return { wamid: parsed.data.messages[0]!.id };
}

async function getJson(url: string, fetchFn: typeof globalThis.fetch): Promise<unknown> {
  try {
    const respuesta = await fetchFn(url);
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw descubrimientoFallido();
    return cuerpo;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw descubrimientoFallido();
  }
}

/**
 * Descubre los números de WhatsApp Business visibles para el token
 * autorizado — encadena `GET /me/businesses` → `GET /{business_id}/
 * owned_whatsapp_business_accounts` → `GET /{waba_id}/phone_numbers`
 * (Meta, "Embedded Signup"/"WhatsApp Business Management API"). Best-effort:
 * un `business`/`waba` sin resultados en el siguiente paso simplemente no
 * aporta números, nunca aborta el descubrimiento completo.
 *
 * NOTA para el usuario (documentada también en el resumen de esta tarea):
 * la forma exacta de estos tres endpoints de descubrimiento debe verificarse
 * contra la guía vigente de Meta ("WhatsApp Embedded Signup") antes de
 * producción — no hay forma de probarla contra la API real sin credenciales
 * de una Meta App con WhatsApp Business habilitado.
 */
export async function descubrirNumeros(
  tokenAcceso: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<WhatsAppNumeroDescubiertoDto[]> {
  const businessesRaw = await getJson(
    `${GRAPH_API_BASE_URL}/me/businesses?access_token=${encodeURIComponent(tokenAcceso)}`,
    fetchFn,
  );
  const businesses = whatsappBusinessesRespuestaSchema.safeParse(businessesRaw);
  if (!businesses.success) throw descubrimientoFallido();

  const numeros: WhatsAppNumeroDescubiertoDto[] = [];

  for (const business of businesses.data.data) {
    const wabasRaw = await getJson(
      `${GRAPH_API_BASE_URL}/${encodeURIComponent(business.id)}/owned_whatsapp_business_accounts?access_token=${encodeURIComponent(tokenAcceso)}`,
      fetchFn,
    );
    const wabas = whatsappOwnedWabaRespuestaSchema.safeParse(wabasRaw);
    if (!wabas.success) continue;

    for (const waba of wabas.data.data) {
      const phoneNumbersRaw = await getJson(
        `${GRAPH_API_BASE_URL}/${encodeURIComponent(waba.id)}/phone_numbers?access_token=${encodeURIComponent(tokenAcceso)}`,
        fetchFn,
      );
      const phoneNumbers = whatsappPhoneNumbersRespuestaSchema.safeParse(phoneNumbersRaw);
      if (!phoneNumbers.success) continue;

      for (const numero of phoneNumbers.data.data) {
        numeros.push({
          wabaId: waba.id,
          numeroTelefonoId: numero.id,
          numeroDisplay: numero.display_phone_number,
          verifiedName: numero.verified_name ?? null,
        });
      }
    }
  }

  return numeros;
}
