import { httpClient, type QueryParamValue } from "@/api/httpClient";
import type { ConversacionListItem, Mensaje } from "@/tipos/conversacion";

/**
 * Capa de datos de la bandeja de conversaciones de WhatsApp -- backend real,
 * contrato congelado (`docs/contrato-frontend-whatsapp-api_mat_04.md`,
 * secciones 4-6). Mismo patrón que `whatsapp.api.ts`/`bridges.api.ts`:
 * una función `async` por endpoint, respuestas locales al archivo,
 * `httpClient` ya mapea `{ code, message }` a `ApiError` con mensaje
 * accionable en español -- las excepciones se propagan tal cual.
 *
 * Notas de contrato:
 *  - `GET /conversaciones` responde un objeto plano `{ conversaciones, total }`
 *    (sin envoltura `data`, sin eco de `pagina`/`limite` -- el cliente los
 *    rastrea). Ordenado `ultimoMensajeEn` desc.
 *  - `GET /conversaciones/:id/mensajes` responde `{ mensajes, total }`
 *    ordenado `enviadoEn` desc (más nuevo primero). La UI invierte cada
 *    página para el orden de chat (viejo arriba) -- eso NO se hace acá.
 *  - `POST /conversaciones/:id/mensajes` responde 201 con envoltura
 *    `{ mensaje }` (ojo: la respuesta sí se envuelve, a diferencia de las
 *    dos anteriores).
 */

/** Tamaños de página admitidos por el backend para `limite`. */
export const LIMITES_CONVERSACIONES = [10, 25, 50, 100] as const;
export type LimiteConversaciones = (typeof LIMITES_CONVERSACIONES)[number];

/** Tope del backend para el cuerpo del mensaje (`texto`), en caracteres. */
export const LONGITUD_MAXIMA_MENSAJE = 4096;

export interface ConversacionesQueryParams {
  /** 1-based, default 1 en el backend. */
  pagina: number;
  /** Uno de `LIMITES_CONVERSACIONES`; default 25 en el backend. */
  limite: LimiteConversaciones;
  /** Aditivo al scope RBAC (`empresaId`/`asesorId`): acota a las conversaciones de un cliente puntual. */
  clienteId?: string;
  /**
   * Fix (2026-09-02, bug real de producción): drill-down de un holding-wide
   * sobre una empresa puntual (`useVistaEmpresa()`) -- el backend
   * (`conversaciones.service.ts::listConversaciones`, vía
   * `leads.access.ts::aplicarFiltroEmpresa`) ya lo soporta desde hace días,
   * pero esta interfaz nunca lo declaraba y ningún llamador lo mandaba: un
   * holding-wide "entrando" a la vista de una empresa seguía viendo TODAS
   * las conversaciones de TODO el holding mezcladas, sin ningún error --
   * la rama 3 de `aplicarFiltroEmpresa` (holding-wide sin `query.empresaId`)
   * agrega todo el holding en silencio. Mismo campo que ya usan
   * `leads.api.ts`/`usuarios.api.ts`/`reportes` para este mismo patrón.
   */
  empresaId?: string;
}

export interface ListarConversacionesResponse {
  conversaciones: ConversacionListItem[];
  total: number;
}

/**
 * `GET /conversaciones`: listado paginado. Además de `pagina`/`limite`
 * acepta `clienteId` opcional, aditivo al scope RBAC existente
 * (`empresaId`/`asesorId`), para acotar a las conversaciones de un cliente
 * puntual (un cliente tiene como mucho una conversación de WhatsApp).
 */
export async function listarConversacionesApi(
  params: ConversacionesQueryParams,
): Promise<ListarConversacionesResponse> {
  // Cast solo de tipos, mismo criterio que `fetchBridgesApi`: los valores ya
  // cumplen `QueryParamValue` uno por uno, falta solo el índice de string.
  return httpClient.get<ListarConversacionesResponse>("/conversaciones", {
    params: params as unknown as Record<string, QueryParamValue>,
  });
}

export interface ListarMensajesResponse {
  mensajes: Mensaje[];
  total: number;
}

/**
 * `GET /conversaciones/:id/mensajes`: historial paginado, `enviadoEn` desc.
 * Errores: 400 `validacion_invalida`, 403 `permiso_denegado`,
 * 404 `conversacion_no_encontrada`.
 */
export async function listarMensajesApi(
  conversacionId: string,
  params: ConversacionesQueryParams,
): Promise<ListarMensajesResponse> {
  return httpClient.get<ListarMensajesResponse>(`/conversaciones/${conversacionId}/mensajes`, {
    params: params as unknown as Record<string, QueryParamValue>,
  });
}

interface EnviarMensajeResponse {
  mensaje: Mensaje;
}

/**
 * `POST /conversaciones/:id/mensajes`: respuesta del asesor. El backend
 * envía de verdad vía WhatsApp Cloud API y solo persiste tras confirmación
 * de Meta (nunca optimista). Errores: 400 `validacion_invalida`,
 * 403 `permiso_denegado`, 404 `conversacion_no_encontrada`,
 * 422 `whatsapp_cliente_sin_telefono`, 503 `whatsapp_conexion_no_disponible`
 * -- el `message` del `ApiError` ya viene accionable en español.
 */
export async function enviarMensajeApi(conversacionId: string, texto: string): Promise<Mensaje> {
  const { mensaje } = await httpClient.post<EnviarMensajeResponse>(
    `/conversaciones/${conversacionId}/mensajes`,
    { texto },
  );
  return mensaje;
}
