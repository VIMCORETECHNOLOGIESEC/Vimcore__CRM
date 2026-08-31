import { httpClient } from "@/api/httpClient";
import type {
  BridgeApiExternaConfig,
  SaveConexionApiExternaInput,
  SaveMapeoApiExternaInput,
  ResultadoPruebaConexionApiExterna,
} from "@/tipos/bridge";

/**
 * Capa de datos de los 3 endpoints que configuran y prueban un bridge
 * `API_EXTERNA` (material de prueba,
 * `docs/contrato-frontend-bridge-api_mat_01.md`) -- el alta del bridge en sí
 * (`redSocial: "API_EXTERNA"`) sigue siendo `POST /bridges`, el mismo
 * endpoint genérico de siempre (`bridges.api.ts::createBridgeApi`), sin
 * duplicarlo acá.
 *
 * LÍMITE DE CONTRATO CONOCIDO (documentado explícitamente en el material de
 * prueba, no es un gap de esta integración): el job de backend que
 * efectivamente hace polling y trae los leads todavía NO EXISTE. Estos 3
 * endpoints solo cargan/corrigen configuración y prueban la conexión --
 * ningún lead real llega todavía a través de un bridge configurado acá.
 *
 * `httpClient` ya mapea errores del backend (`{ code, message }`) a
 * `ApiError` -- se propagan tal cual, mismo criterio que `bridges.api.ts`.
 */

interface BridgeApiExternaConfigResponse {
  bridgeApiConfig: BridgeApiExternaConfig;
}

/**
 * `PATCH /bridges/:id/api-externa/conexion`: carga o corrige la URL, la
 * credencial externa (se cifra en el server, nunca vuelve por la API) y el
 * nombre del header de API key. Idempotente -- sirve tanto para la primera
 * carga como para corregir un error de configuración, sin tocar el mapeo si
 * ya estaba cargado. 400 si el bridge existe pero no es `API_EXTERNA`, 404 si
 * no existe.
 */
export async function saveConexionApiExternaApi(
  bridgeId: string,
  input: SaveConexionApiExternaInput,
): Promise<BridgeApiExternaConfig> {
  const { bridgeApiConfig } = await httpClient.patch<BridgeApiExternaConfigResponse>(
    `/bridges/${bridgeId}/api-externa/conexion`,
    input,
  );
  return bridgeApiConfig;
}

/**
 * `PATCH /bridges/:id/api-externa/mapeo`: carga o corrige el mapeo de campos
 * y el parámetro de fecha opcional. Idempotente, mismo criterio que
 * `saveConexionApiExternaApi` -- no toca `url`/credencial ya cargados. El
 * backend responde 400 si `mapeoCampos` no mapea ninguna clave a
 * `"idExternoLead"` -- el frontend valida lo mismo antes de llamar
 * (`ApiExternaSetupDialog.tsx`) para no depender solo del round-trip.
 */
export async function saveMapeoApiExternaApi(
  bridgeId: string,
  input: SaveMapeoApiExternaInput,
): Promise<BridgeApiExternaConfig> {
  const { bridgeApiConfig } = await httpClient.patch<BridgeApiExternaConfigResponse>(
    `/bridges/${bridgeId}/api-externa/mapeo`,
    input,
  );
  return bridgeApiConfig;
}

/**
 * `POST /bridges/:id/api-externa/probar-conexion`: prueba diagnóstica sin
 * body -- SIEMPRE responde 200 con `{ ok, mensaje, cantidadLeads? }`, nunca un
 * error HTTP por un problema de la API externa (contrato explícito). Nunca
 * persiste nada.
 */
export async function testConexionApiExternaApi(
  bridgeId: string,
): Promise<ResultadoPruebaConexionApiExterna> {
  return httpClient.post<ResultadoPruebaConexionApiExterna>(
    `/bridges/${bridgeId}/api-externa/probar-conexion`,
  );
}
