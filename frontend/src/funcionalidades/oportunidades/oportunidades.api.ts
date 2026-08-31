import { httpClient, type QueryParamValue } from "@/api/httpClient";
import type { EtapaLead, OrigenLead, RedSocial, SemaforoLead } from "@/tipos/lead";
import type {
  Oportunidad,
  OportunidadPlana,
  ProductoOportunidad,
  ResponsableOportunidad,
} from "@/tipos/oportunidad";

/**
 * Capa de datos del Bloque D (Oportunidad / negociación) -- backend real
 * (`backend/src/controllers/negociacion/*`). Mismas convenciones que
 * `funcionalidades/leads/leads.api.ts` y `funcionalidades/bridges/bridges.api.ts`:
 * interfaces `Backend*` locales para la forma cruda, mappers manuales, sin
 * Zod en el borde de respuesta. Los errores se propagan como `ApiError` tal
 * cual (`httpClient` ya trae mensaje accionable en español) -- no se
 * reenvuelven.
 */

// ---------------------------------------------------------------------------
// Catálogo de productos (D14): listar + crear. El backend no expone
// PATCH/DELETE/toggle.
// ---------------------------------------------------------------------------

export interface BackendProducto {
  id: string;
  empresaId: string;
  nombre: string;
  activo: boolean;
  /** `Date` de Prisma serializado por `res.json` -- ISO 8601. */
  creadoEn: string;
}

export function mapProductoFromApi(raw: BackendProducto): ProductoOportunidad {
  return {
    id: raw.id,
    empresaId: raw.empresaId,
    nombre: raw.nombre,
    activo: raw.activo,
    creadoEn: raw.creadoEn,
  };
}

/**
 * `GET /productos` (cualquier sesión autenticada). `activo` viaja como
 * `"true"`/`"false"` -- el backend lo valida con `z.enum(["true","false"])`
 * (evita la trampa de `z.coerce.boolean()`, que trata `"false"` como `true`).
 */
export async function fetchProductosApi(params: {
  empresaId?: string;
  activo?: boolean;
}): Promise<ProductoOportunidad[]> {
  const respuesta = await httpClient.get<{ productos: BackendProducto[] }>("/productos", {
    params: {
      empresaId: params.empresaId,
      activo: params.activo === undefined ? undefined : String(params.activo),
    },
  });
  return respuesta.productos.map(mapProductoFromApi);
}

/** `POST /productos` (requireRole ADMINISTRADOR). `empresaId` opcional: lo resuelve el server para sesiones company-scoped. */
export async function crearProductoApi(input: {
  nombre: string;
  empresaId?: string;
}): Promise<ProductoOportunidad> {
  const respuesta = await httpClient.post<{ producto: BackendProducto }>("/productos", {
    nombre: input.nombre,
    empresaId: input.empresaId,
  });
  return mapProductoFromApi(respuesta.producto);
}

// ---------------------------------------------------------------------------
// Oportunidades: forma cruda del backend (`OPORTUNIDAD_RELACIONES_INCLUDE` en
// `oportunidad.repository.ts`) y mappers.
// ---------------------------------------------------------------------------

interface BackendResponsable {
  id: string;
  nombre: string;
  rol: string;
}

interface BackendOportunidadCliente {
  id: string;
  nombre: string | null;
  telefonoOriginal: string | null;
  telefonoNormalizado: string | null;
  telefonoValido: boolean;
}

interface BackendOportunidadLead {
  id: string;
  etapa: EtapaLead;
  origen: OrigenLead;
  redSocial: RedSocial | null;
  cliente: BackendOportunidadCliente;
}

/** Modelo plano de `Oportunidad` (lo que devuelven las mutaciones). */
export interface BackendOportunidadPlana {
  id: string;
  leadId: string;
  empresaId: string;
  productoId: string | null;
  etapa: EtapaLead;
  semaforo: SemaforoLead | null;
  puntuacion: number | null;
  asesorId: string | null;
  vendedorId: string | null;
  /** `Prisma.Decimal` serializado como string JSON, o número, o null. */
  montoVenta: string | number | null;
  observacionCierre: string | null;
  formaPago: Oportunidad["formaPago"];
  slaInicioEn: string | null;
  cerradaEn: string | null;
  creadaEn: string;
  version: number;
}

/** Modelo enriquecido (`OportunidadConRelaciones`) que devuelven los GET. */
export interface BackendOportunidad extends BackendOportunidadPlana {
  lead: BackendOportunidadLead;
  producto: BackendProducto | null;
  asesor: BackendResponsable | null;
  vendedor: BackendResponsable | null;
}

interface BackendOportunidadesListResponse {
  oportunidades: BackendOportunidad[];
  total: number;
  pagina: number;
  limite: number;
}

function mapResponsable(raw: BackendResponsable | null): ResponsableOportunidad | null {
  return raw ? { id: raw.id, nombre: raw.nombre, rol: raw.rol as ResponsableOportunidad["rol"] } : null;
}

/** Normaliza el subconjunto plano; `montoVenta` Decimal-string → número (mismo criterio que `mapLeadFromApi`). */
export function mapOportunidadPlanaFromApi(raw: BackendOportunidadPlana): OportunidadPlana {
  return {
    id: raw.id,
    leadId: raw.leadId,
    empresaId: raw.empresaId,
    productoId: raw.productoId,
    etapa: raw.etapa,
    semaforo: raw.semaforo,
    puntuacion: raw.puntuacion,
    asesorId: raw.asesorId,
    vendedorId: raw.vendedorId,
    montoVenta: raw.montoVenta == null ? null : Number(raw.montoVenta),
    observacionCierre: raw.observacionCierre,
    formaPago: raw.formaPago,
    slaInicioEn: raw.slaInicioEn,
    cerradaEn: raw.cerradaEn,
    creadaEn: raw.creadaEn,
    version: raw.version,
  };
}

/** Adapta la fila enriquecida: subconjunto plano + `lead`/`cliente` anidados + relaciones nulas preservadas. */
export function mapOportunidadFromApi(raw: BackendOportunidad): Oportunidad {
  return {
    ...mapOportunidadPlanaFromApi(raw),
    lead: {
      id: raw.lead.id,
      etapa: raw.lead.etapa,
      origen: raw.lead.origen,
      redSocial: raw.lead.redSocial ?? null,
      cliente: {
        id: raw.lead.cliente.id,
        nombre: raw.lead.cliente.nombre ?? "",
        telefonoOriginal: raw.lead.cliente.telefonoOriginal ?? "",
        telefonoNormalizado: raw.lead.cliente.telefonoNormalizado ?? "",
        telefonoValido: raw.lead.cliente.telefonoValido,
      },
    },
    producto: raw.producto ? mapProductoFromApi(raw.producto) : null,
    asesor: mapResponsable(raw.asesor),
    vendedor: mapResponsable(raw.vendedor),
  };
}

// ---------------------------------------------------------------------------
// Listado + creación de oportunidades.
// ---------------------------------------------------------------------------

export interface OportunidadesQueryParams {
  leadId?: string;
  empresaId?: string;
  asesorId?: string;
  etapa?: EtapaLead;
  /** 1-based. */
  pagina: number;
  /** Whitelist del backend: 10, 25, 50 o 100 (cualquier otro valor → 400). */
  limite: number;
}

export interface OportunidadesResponse {
  oportunidades: Oportunidad[];
  total: number;
  pagina: number;
  limite: number;
}

/**
 * `GET /oportunidades`. `empresaId`/`asesorId` solo los honra el backend para
 * ADMINISTRADOR/SUPERVISOR; un ASESOR/VENDEDOR queda acotado a su cartera por
 * el `where` de rol. Las claves de respuesta son `oportunidades`/`limite` (no
 * `datos`/`porPagina`).
 */
export async function fetchOportunidadesApi(
  params: OportunidadesQueryParams,
): Promise<OportunidadesResponse> {
  const respuesta = await httpClient.get<BackendOportunidadesListResponse>("/oportunidades", {
    params: params as unknown as Record<string, QueryParamValue>,
  });
  return {
    oportunidades: respuesta.oportunidades.map(mapOportunidadFromApi),
    total: respuesta.total,
    pagina: respuesta.pagina,
    limite: respuesta.limite,
  };
}

/**
 * `POST /oportunidades` (D13/D14/D3/D4). Devuelve el modelo PLANO sin
 * relaciones -- el llamador usa el `id` para navegar y deja que la query de
 * detalle traiga la forma enriquecida. 409 `oportunidad_duplicada` /
 * `producto_invalido`, 404 `lead_no_encontrado` se propagan como `ApiError`.
 */
export async function crearOportunidadApi(input: {
  leadId: string;
  productoId?: string;
}): Promise<OportunidadPlana> {
  const respuesta = await httpClient.post<{ oportunidad: BackendOportunidadPlana }>("/oportunidades", {
    leadId: input.leadId,
    productoId: input.productoId,
  });
  return mapOportunidadPlanaFromApi(respuesta.oportunidad);
}
