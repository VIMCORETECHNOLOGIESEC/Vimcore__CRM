import type { EstadoConexionWhatsApp } from "@prisma/client";

/** `GET /whatsapp/conectar` (mismo shape que `LinkedInOAuthStartDto`). */
export interface WhatsAppOAuthStartDto {
  authorizationUrl: string;
  expiraEn: string;
}

/**
 * Un número de WhatsApp Business descubierto en la cuenta de Meta autorizada
 * (`GET /{waba_id}/phone_numbers`) — todavía NO conectado a esta empresa.
 */
export interface WhatsAppNumeroDescubiertoDto {
  wabaId: string;
  numeroTelefonoId: string;
  numeroDisplay: string;
  verifiedName: string | null;
}

/**
 * `GET /whatsapp/callback` — la lista de números descubiertos MÁS un
 * `seleccion` opaco (blob cifrado, ver `whatsapp-oauth.service.ts`) que el
 * frontend debe reenviar tal cual en `POST /whatsapp/conexion`. El schema
 * aprobado (`WhatsAppOAuthState`) no tiene ninguna columna para retener el
 * access token exchangeado entre estas dos requests — `seleccion` es la
 * decisión de diseño que cierra ese hueco sin tocar el schema (ver el
 * comentario de diseño en `whatsapp-oauth.service.ts`).
 */
export interface WhatsAppOAuthCallbackDto {
  numeros: WhatsAppNumeroDescubiertoDto[];
  seleccion: string;
  expiraEn: string;
}

/** Proyección seguras de `WhatsAppConexion` — el ciphertext del token NUNCA sale por HTTP. */
export interface WhatsAppConexionDto {
  id: string;
  empresaId: string;
  numeroTelefonoId: string;
  numeroDisplay: string;
  wabaId: string;
  estado: EstadoConexionWhatsApp;
  creadoEn: string;
}
