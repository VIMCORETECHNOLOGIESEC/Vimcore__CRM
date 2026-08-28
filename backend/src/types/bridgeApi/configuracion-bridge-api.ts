/**
 * Forma de `Bridge.configuracionJson` (columna JSONB) para bridges
 * `redSocial = API_EXTERNA`: pull genérico vía GET + `X-Api-Key`, sin
 * adaptador propio por proveedor — el mapeo de campos se configura por
 * bridge en vez de escribirse en código.
 *
 * `mapeoCampos` va de clave externa (como la devuelve el GET del cliente) a
 * campo fijo de `LeadEntrante`. `idExternoLead` es obligatorio dentro del
 * mapeo — sin él no hay idempotencia posible contra
 * `LeadRecibido.@@unique([bridgeId, idExternoLead])` — pero esa obligación
 * se valida en la capa Zod (`bridges.schema.ts`), no acá: a nivel de tipo,
 * las claves externas son arbitrarias y no se conocen de antemano.
 * Cualquier clave del payload externo que no aparezca en este mapeo cae
 * directo en `LeadEntrante.camposDinamicos`, igual que en los demás
 * adaptadores.
 */
export type CampoLeadMapeable =
  | "nombre"
  | "telefono"
  | "correo"
  | "idExternoLead"
  | "idExternoCampania"
  | "nombreCampania"
  | "idExternoCuenta";

export interface ConfiguracionBridgeApi {
  url: string;
  // Nombre del query param de fecha que soporta el GET del cliente (ISO
  // 8601 UTC). Ausente = el poll trae todo y confía en el `UNIQUE` de
  // `LeadRecibido` para descartar lo repetido.
  parametroFecha?: string;
  // Nombre del header HTTP donde va la credencial descifrada. Ausente =
  // "X-Api-Key" (todas las APIs propias del cliente lo usan así hoy) —
  // configurable para una API de terceros que espere otro nombre (ej.
  // "Authorization").
  nombreHeaderApiKey?: string;
  mapeoCampos: Record<string, CampoLeadMapeable>;
}

export const NOMBRE_HEADER_API_KEY_DEFAULT = "X-Api-Key";
