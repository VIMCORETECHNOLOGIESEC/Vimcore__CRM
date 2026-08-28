import { httpClient, type QueryParamValue } from "@/api/httpClient";
import type { EstadoSla, EtapaLead, Lead, RedSocial, ResponsableLead, SemaforoLead } from "@/tipos/lead";
import type { RolUsuario } from "@/tipos/usuario";

/**
 * Capa de datos de leads -- backend real (M5/M6, integración F3/F4). Ver
 * `sdd/integracion-leads-f3-f4/design` (D-A1/D-A2) y
 * `docs/06-modulos-backend.md`. Reemplaza el mock en memoria que usaba esta
 * capa hasta la integración de F3+.
 */

export interface LeadsQueryParams {
  /** 1-based. */
  pagina: number;
  /** Tamaño de página. Se manda como `limite` al backend real (máx. 100). */
  porPagina: number;
  /** Nombre, teléfono o correo del cliente (docs/07 F3, "Búsqueda"). Campaña queda deliberadamente fuera (spec). */
  busqueda?: string;
  etapa?: EtapaLead;
  semaforo?: SemaforoLead;
  redSocial?: RedSocial;
  /**
   * INTEGRACION-BACKEND-GAP: el backend real no tiene una entidad de
   * campaña con `id` (M4/F8, fuera de alcance de esta integración -- ver
   * `sdd/integracion-leads-f3-f4/explore`). `getCatalogoCampanias()` sigue
   * siendo un catálogo local fijo; este filtro queda deliberadamente SIN
   * enviar al backend (ver `fetchLeadsApi`) para no filtrar con un id que
   * el servidor no reconoce.
   */
  campaniaId?: string;
  /** Nombre de campaña, filtrado por el backend contra `payload_original`. */
  campania?: string;
  responsableId?: string;
  /** ISO `YYYY-MM-DD`, inclusive. Se manda como `desde` al backend real. */
  fechaDesde?: string;
  /** ISO `YYYY-MM-DD`, inclusive. Se manda como `hasta` al backend real. */
  fechaHasta?: string;
  estadoSla?: EstadoSla;
}

export interface LeadsResponse {
  datos: Lead[];
  total: number;
  pagina: number;
  porPagina: number;
}

// ---------------------------------------------------------------------------
// Forma cruda de la respuesta del backend real (Prisma `include`, ver
// `backend/src/repositories/lead.repository.ts::LEAD_RELACIONES_INCLUDE` y
// `backend/src/services/leads.service.ts::LeadDetalleConSla`). Tipado local
// mínimo -- el frontend no comparte el cliente de Prisma generado (mismo
// criterio que `tipos/lead.ts`).
// ---------------------------------------------------------------------------

interface BackendCliente {
  id: string;
  nombre: string | null;
  telefonoOriginal: string | null;
  telefonoNormalizado: string | null;
  telefonoValido: boolean;
}

interface BackendResponsable {
  id: string;
  nombre: string;
  rol: RolUsuario;
}

export interface BackendLeadDetalleConSla {
  id: string;
  clienteId: string;
  cliente: BackendCliente;
  origen: "NUEVO" | "REINGRESO";
  redSocial: RedSocial | null;
  etapa: EtapaLead;
  semaforo: SemaforoLead | null;
  puntuacion: number | null;
  asesorId: string | null;
  asesor: BackendResponsable | null;
  vendedorId: string | null;
  vendedor: BackendResponsable | null;
  slaInicioEn: string | null;
  ingresadoEn: string;
  cerradoEn: string | null;
  montoVenta: string | number | null;
  productoServicio: string | null;
  formaPago: Lead["formaPago"];
  observacionCierre: string | null;
}

interface BackendLeadsListResponse {
  leads: BackendLeadDetalleConSla[];
  total: number;
  pagina: number;
  limite: number;
}

/**
 * Adapta la forma real del backend (D-A1: `cliente`/`asesor`/`vendedor`
 * anidados, `Prisma.Decimal` serializado como string, etc.) a la forma
 * `Lead` que ya consumen `LeadsTable.tsx`/`LeadDetalleEncabezado.tsx`/el
 * resto de la UI (fuera del alcance de este cambio, ver
 * `sdd/integracion-leads-f3-f4/apply-progress`).
 *
 * INTEGRACION-BACKEND-GAP (documentado, no resuelto en este cambio):
 * - `cliente.correoPrincipal` siempre `null`: el `include` real
 *   (`cliente: true`) no trae la relación `correos` del cliente -- haría
 *   falta un include anidado (`cliente: { include: { correos: true } }`)
 *   que el diseño D-A1 no contempló.
 * - `campania`/`cuentaPublicitaria` siempre `null`: el backend no tiene
 *   esas entidades con `id` (ver nota en `LeadsQueryParams.campaniaId`).
 * - `semaforo`/`puntuacion` pueden ser `null` en la BD real para un lead
 *   `NUEVO` sin calificar todavía (D14, `docs/06-modulos-backend.md`); el
 *   tipo `Lead` los declara nullable y `SemaforoBadge` renderiza un estado
 *   neutro ("Sin calificar") en ese caso -- ver `SemaforoBadge.tsx`.
 */
export function mapLeadFromApi(raw: BackendLeadDetalleConSla): Lead {
  return {
    id: raw.id,
    cliente: {
      id: raw.cliente.id,
      nombre: raw.cliente.nombre ?? "",
      telefonoOriginal: raw.cliente.telefonoOriginal ?? "",
      telefonoNormalizado: raw.cliente.telefonoNormalizado ?? "",
      correoPrincipal: null,
      telefonoValido: raw.cliente.telefonoValido,
    },
    campania: null,
    origen: raw.origen,
    // `redSocial` es nullable en el backend (M4, leads previos a esa
    // rebanada) -- INSTAGRAM como último recurso visual, nunca lógica de
    // negocio (el filtro por red social no depende de este valor por
    // defecto, solo la UI necesita *algo* que renderizar).
    redSocial: raw.redSocial ?? "INSTAGRAM",
    etapa: raw.etapa,
    semaforo: raw.semaforo,
    puntuacion: raw.puntuacion,
    asesor: raw.asesor
      ? { id: raw.asesor.id, nombre: raw.asesor.nombre, rol: raw.asesor.rol as ResponsableLead["rol"] }
      : null,
    vendedor: raw.vendedor
      ? { id: raw.vendedor.id, nombre: raw.vendedor.nombre, rol: raw.vendedor.rol as ResponsableLead["rol"] }
      : null,
    slaInicioEn: raw.slaInicioEn,
    ingresadoEn: raw.ingresadoEn,
    cerradoEn: raw.cerradoEn,
    cuentaPublicitaria: null,
    montoVenta: raw.montoVenta === null ? null : Number(raw.montoVenta),
    productoVendido: raw.productoServicio,
    formaPago: raw.formaPago,
    observacionCierre: raw.observacionCierre,
  };
}

/** `GET /leads` (D-A1, backend real). Filtro por rol lo aplica el servidor desde el JWT. */
export async function fetchLeadsApi(params: LeadsQueryParams): Promise<LeadsResponse> {
  const respuesta = await httpClient.get<BackendLeadsListResponse>("/leads", {
    params: {
      pagina: params.pagina,
      limite: params.porPagina,
      busqueda: params.busqueda,
      etapa: params.etapa,
      // `sin_calificar` (backend) no tiene equivalente en `SemaforoLead`
      // (frontend) -- ver `EstadoSla`/`SemaforoLead` en `tipos/lead.ts`,
      // fuera de alcance de este cambio. Se manda tal cual si coincide con
      // un valor real del enum.
      semaforo: params.semaforo,
      redSocial: params.redSocial,
      responsableId: params.responsableId,
      campania: params.campania,
      desde: params.fechaDesde,
      hasta: params.fechaHasta,
      // INTEGRACION-BACKEND-GAP: `EstadoSla` del frontend incluye "CERRADO"
      // (etapa terminal), que no existe en el enum del backend
      // (`a_tiempo|en_riesgo|atrasado|sin_iniciar`) -- se omite ese caso en
      // vez de mandar un valor que el servidor rechazaría o interpretaría
      // distinto.
      estadoSla: mapEstadoSlaToBackend(params.estadoSla),
    } as Record<string, QueryParamValue>,
  });

  return {
    datos: respuesta.leads.map(mapLeadFromApi),
    total: respuesta.total,
    pagina: respuesta.pagina,
    porPagina: respuesta.limite,
  };
}

/**
 * Filtros aceptados por `GET /leads/catalogo/redes-sociales` (backend real,
 * commit `e753fdc`): los mismos que `LeadsQueryParams`, salvo `redSocial`
 * (es justamente el campo que este catálogo alimenta -- se excluye para que
 * nunca se autoexcluya de sus propias opciones) y la paginación (el backend
 * la ignora, reutiliza `listLeadsQuerySchema` completo).
 */
export type RedesSocialesCatalogoParams = Omit<LeadsQueryParams, "redSocial" | "pagina" | "porPagina">;

interface BackendRedesSocialesCatalogoResponse {
  redesSociales: RedSocial[];
}

/**
 * `GET /leads/catalogo/redes-sociales` (Requirement: cascada con los demás
 * filtros de F3). Reemplaza a `fetchRedesSocialesActivasApi`
 * (`GET /bridges/redes-activas`, admin-only) como fuente del filtro "Red
 * social" de `LeadsFiltros.tsx` -- este endpoint solo exige sesión (el
 * scoping por rol lo hace el propio query en el backend, igual que
 * `fetchLeadsApi`), así que ya no hace falta gatear la petición por rol en
 * el frontend. `campaniaId` no se manda -- mismo
 * INTEGRACION-BACKEND-GAP que `fetchLeadsApi` (arriba): el backend no tiene
 * una entidad `campania` con `id`.
 */
export async function fetchRedesSocialesCatalogoApi(
  params: RedesSocialesCatalogoParams,
): Promise<RedSocial[]> {
  const respuesta = await httpClient.get<BackendRedesSocialesCatalogoResponse>(
    "/leads/catalogo/redes-sociales",
    {
      params: {
        busqueda: params.busqueda,
        etapa: params.etapa,
        semaforo: params.semaforo,
        responsableId: params.responsableId,
        desde: params.fechaDesde,
        hasta: params.fechaHasta,
        estadoSla: mapEstadoSlaToBackend(params.estadoSla),
      } as Record<string, QueryParamValue>,
    },
  );

  return respuesta.redesSociales;
}

function mapEstadoSlaToBackend(estado: EstadoSla | undefined): string | undefined {
  if (!estado) return undefined;
  switch (estado) {
    case "A_TIEMPO":
      return "a_tiempo";
    case "EN_RIESGO":
      return "en_riesgo";
    case "ATRASADO":
      return "atrasado";
    case "CERRADO":
      // Sin equivalente en el backend real -- ver INTEGRACION-BACKEND-GAP arriba.
      return undefined;
  }
}

export interface AsignarLoteResultado {
  exitosos: { leadId: string; asesorId: string }[];
  fallidos: { leadId: string; codigo: string; mensaje: string }[];
  resumen: { solicitados: number; exitosos: number; fallidos: number };
}

/**
 * `POST /leads/asignar-lote` (D-A1, backend real): un único request para
 * todo el lote, reporte por lead (nunca all-or-nothing) -- ver
 * `useLeads.ts::useAssignLeadsMasivo` para cómo se usa `fallidos`.
 */
export async function assignLeadsMasivoApi(
  leadIds: string[],
  responsableId: string,
): Promise<AsignarLoteResultado> {
  return httpClient.post<AsignarLoteResultado>("/leads/asignar-lote", {
    leadIds,
    asesorId: responsableId,
  });
}

/**
 * Población contra la que busca `ResponsableCombobox`. `"TODOS"` es el
 * comportamiento de los filtros generales (dashboard F5, tabla de leads F3):
 * buscan indistintamente entre asesores y vendedores. El detalle de lead
 * (F4) restringe el listado según qué campo del lead está asignando cada
 * buscador: `"ASESORES"` para el responsable del primer contacto,
 * `"VENDEDORES"` para el responsable del proceso de venta.
 */
export type ListadoResponsables = "TODOS" | "ASESORES" | "VENDEDORES";

interface BackendResponsablesResponse {
  responsables: BackendResponsable[];
}

async function fetchResponsablesPorRol(rol: "ASESOR" | "VENDEDOR"): Promise<BackendResponsable[]> {
  const { responsables } = await httpClient.get<BackendResponsablesResponse>("/usuarios/responsables", {
    params: { rol },
  });
  return responsables;
}

/**
 * `GET /usuarios/responsables?rol=` (D-A2, backend real, accesible a
 * Administrador y Supervisor). `"TODOS"` combina ambos roles en dos
 * llamadas -- el backend exige `rol` como parámetro obligatorio, no admite
 * "todos" en un único request.
 */
export async function getCatalogoResponsables(
  listado: ListadoResponsables = "TODOS",
): Promise<{ id: string; nombre: string }[]> {
  const responsables = await getCatalogoResponsablesPorListado(listado);
  return responsables.map(({ id, nombre }) => ({ id, nombre }));
}

async function getCatalogoResponsablesPorListado(
  listado: ListadoResponsables,
): Promise<BackendResponsable[]> {
  if (listado === "ASESORES") return fetchResponsablesPorRol("ASESOR");
  if (listado === "VENDEDORES") return fetchResponsablesPorRol("VENDEDOR");
  const [asesores, vendedores] = await Promise.all([
    fetchResponsablesPorRol("ASESOR"),
    fetchResponsablesPorRol("VENDEDOR"),
  ]);
  return [...asesores, ...vendedores];
}

const CAMPANIA_VERANO = { id: "camp-1", nombre: "Verano 2026" };
const CAMPANIA_LANZAMIENTO = { id: "camp-2", nombre: "Lanzamiento Q3" };
const CAMPANIA_CREDITOS = { id: "camp-3", nombre: "Campaña Créditos" };
const CAMPANIA_EXPANSION_REGIONAL = {
  id: "camp-4",
  nombre: "Campaña de Expansión Regional Costa-Sierra Segundo Semestre 2026",
};

/**
 * INTEGRACION-BACKEND-GAP: catálogo local fijo, sin backend real detrás --
 * el modelo de datos real no tiene una entidad `campania` con `id` (M4/F8,
 * fuera de alcance, ver `sdd/integracion-leads-f3-f4/explore`). El filtro
 * de campaña de la UI queda funcionalmente inerte contra datos reales (ver
 * `LeadsQueryParams.campaniaId`).
 */
export function getCatalogoCampanias(): { id: string; nombre: string }[] {
  return [CAMPANIA_VERANO, CAMPANIA_LANZAMIENTO, CAMPANIA_CREDITOS, CAMPANIA_EXPANSION_REGIONAL];
}

/**
 * Igual que `getCatalogoResponsables`, pero conservando `rol` -- lo usa F4
 * (`leadDetalle.api.ts`) para decidir a qué campo del `Lead` (`asesor` o
 * `vendedor`) escribir al reasignar/traspasar.
 */
export async function getCatalogoResponsablesConRol(): Promise<ResponsableLead[]> {
  const responsables = await getCatalogoResponsablesPorListado("TODOS");
  return responsables.map(({ id, nombre, rol }) => ({ id, nombre, rol: rol as ResponsableLead["rol"] }));
}

/**
 * Solo vendedores, para el traspaso (F4) -- atajo de
 * `getCatalogoResponsables("VENDEDORES")`.
 */
export async function getCatalogoVendedores(): Promise<{ id: string; nombre: string }[]> {
  return getCatalogoResponsables("VENDEDORES");
}

// ---------------------------------------------------------------------------
// LEADS_MOCK -- FUERA DE ALCANCE de esta integración (F3/F4). Ya no lo usa
// ninguna función de este archivo ni de `detalle/leadDetalle.api.ts` (spec
// "Reemplazo completo de mocks" cumplido para F3/F4). Sigue existiendo
// únicamente porque `funcionalidades/dashboard/metricas.api.ts` (F5, 7
// calculadoras de KPI síncronas) y `funcionalidades/notificaciones/
// notificaciones.api.ts` (F6) lo consumen directamente y NO son parte del
// dominio de este cambio (`sdd/integracion-leads-f3-f4/spec` cubre
// leads-listado/catalogo-responsables/asignacion-lote/asignacion-
// automatica/leads-detalle -- nunca dashboard KPIs ni notificaciones).
// Migrarlas requiere su propia decisión de diseño (traer todos los leads
// paginando el backend real y calcular client-side, vs. nuevos endpoints de
// agregación en el backend) -- ver el riesgo documentado en
// `sdd/integracion-leads-f3-f4/apply-progress` (Fase 4). No mutar este
// fixture pensando que afecta datos reales: es puramente local a F5/F6.
// ---------------------------------------------------------------------------

const ASESORES = [
  { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" as const },
  { id: "asesor-2", nombre: "Julián Peña", rol: "ASESOR" as const },
];
const VENDEDORES = [
  { id: "vendedor-1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" as const },
  { id: "vendedor-2", nombre: "Andrés Zambrano", rol: "VENDEDOR" as const },
];

const CUENTA_ADS_PRINCIPAL = { id: "cuenta-1", nombre: "Cuenta Ads Principal" };
const CUENTA_ADS_CREDITOS = { id: "cuenta-2", nombre: "Cuenta Ads Créditos" };

function hoursAgo(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

export const LEADS_MOCK: Lead[] = [
  {
    id: "lead-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: "roberto.salazar@mail.com",
      telefonoValido: true,
    },
    campania: CAMPANIA_VERANO,
    origen: "REINGRESO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 32,
    asesor: ASESORES[0],
    vendedor: null,
    slaInicioEn: hoursAgo(0.25),
    ingresadoEn: hoursAgo(0.3),
    cerradoEn: null,
    cuentaPublicitaria: CUENTA_ADS_PRINCIPAL,
    camposDinamicos: { "Presupuesto mensual": "$300 - $500", Interés: "Financiamiento" },
    montoVenta: null,
    productoVendido: null,
    formaPago: null,
    observacionCierre: null,
  },
  {
    id: "lead-02",
    cliente: {
      id: "cliente-02",
      nombre: "María Fernanda Ibarra",
      telefonoOriginal: "0987654321",
      telefonoNormalizado: "+593987654321",
      correoPrincipal: "mfibarra@mail.com",
      telefonoValido: true,
      correosSecundarios: ["mf.ibarra.alt@mail.com"],
    },
    campania: CAMPANIA_LANZAMIENTO,
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "CITA",
    semaforo: "AMARILLO",
    puntuacion: 55,
    asesor: ASESORES[1],
    vendedor: VENDEDORES[0],
    slaInicioEn: hoursAgo(20),
    ingresadoEn: hoursAgo(21),
    cerradoEn: null,
    cuentaPublicitaria: CUENTA_ADS_PRINCIPAL,
    camposDinamicos: {},
    montoVenta: null,
    productoVendido: null,
    formaPago: null,
    observacionCierre: null,
  },
  {
    id: "lead-03",
    cliente: {
      id: "cliente-03",
      nombre: "Diego Andrés Morales",
      telefonoOriginal: "0978112233",
      telefonoNormalizado: "+593978112233",
      correoPrincipal: "diego.morales@mail.com",
    },
    campania: CAMPANIA_VERANO,
    origen: "NUEVO",
    redSocial: "INSTAGRAM",
    etapa: "NUEVO",
    semaforo: "VERDE",
    puntuacion: 78,
    asesor: ASESORES[0],
    vendedor: null,
    slaInicioEn: hoursAgo(3),
    ingresadoEn: hoursAgo(3),
    cerradoEn: null,
  },
  {
    id: "lead-04",
    cliente: {
      id: "cliente-04",
      nombre: "Carla Espinoza",
      telefonoOriginal: "0965887900",
      telefonoNormalizado: "+593965887900",
      correoPrincipal: "carla.espinoza@mail.com",
    },
    campania: CAMPANIA_CREDITOS,
    origen: "NUEVO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 28,
    asesor: ASESORES[1],
    vendedor: null,
    slaInicioEn: hoursAgo(30),
    ingresadoEn: hoursAgo(31),
    cerradoEn: null,
    cuentaPublicitaria: CUENTA_ADS_CREDITOS,
    camposDinamicos: { Ciudad: "Guayaquil" },
  },
  {
    id: "lead-05",
    cliente: {
      id: "cliente-05",
      nombre: "Patricia Núñez",
      telefonoOriginal: "0991112222",
      telefonoNormalizado: "+593991112222",
      correoPrincipal: "patricia.nunez@mail.com",
    },
    campania: CAMPANIA_LANZAMIENTO,
    origen: "NUEVO",
    redSocial: "LINKEDIN",
    etapa: "VENTA",
    semaforo: "VERDE",
    puntuacion: 100,
    asesor: ASESORES[0],
    vendedor: VENDEDORES[1],
    slaInicioEn: hoursAgo(60),
    ingresadoEn: hoursAgo(72),
    cerradoEn: hoursAgo(2),
    cuentaPublicitaria: CUENTA_ADS_PRINCIPAL,
    camposDinamicos: {},
    montoVenta: 4500,
    productoVendido: "Plan Premium Anual",
    formaPago: "CREDITO",
    observacionCierre: "Cliente satisfecho, pago acordado en 12 cuotas.",
  },
  {
    id: "lead-06",
    cliente: {
      id: "cliente-06",
      nombre: "Jorge Iván Castillo",
      telefonoOriginal: "0987001122",
      telefonoNormalizado: "+593987001122",
      correoPrincipal: null,
      telefonoValido: false,
    },
    campania: null,
    origen: "NUEVO",
    redSocial: "GOOGLE_FORMS",
    etapa: "NO_VENTA",
    semaforo: "ROJO",
    puntuacion: 15,
    asesor: ASESORES[1],
    vendedor: VENDEDORES[0],
    slaInicioEn: hoursAgo(96),
    ingresadoEn: hoursAgo(100),
    cerradoEn: hoursAgo(10),
    cuentaPublicitaria: null,
    camposDinamicos: {},
    montoVenta: null,
    productoVendido: null,
    formaPago: null,
    observacionCierre:
      "Cliente indicó que ya contrató con la competencia hace dos semanas; no está interesado en retomar contacto por ahora.",
  },
  {
    id: "lead-07",
    cliente: {
      id: "cliente-07",
      nombre: "Valentina Ríos",
      telefonoOriginal: "0999887766",
      telefonoNormalizado: "+593999887766",
      correoPrincipal: "valentina.rios@mail.com",
    },
    campania: CAMPANIA_VERANO,
    origen: "NUEVO",
    redSocial: "X",
    etapa: "NUEVO",
    semaforo: "AMARILLO",
    puntuacion: 48,
    asesor: null,
    vendedor: null,
    slaInicioEn: null,
    ingresadoEn: hoursAgo(1),
    cerradoEn: null,
  },
  {
    id: "lead-08",
    cliente: {
      id: "cliente-08",
      nombre: "Esteban Ordóñez",
      telefonoOriginal: "0991223344",
      telefonoNormalizado: "+593991223344",
      correoPrincipal: "esteban.ordonez@mail.com",
    },
    campania: null,
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    semaforo: "VERDE",
    puntuacion: 82,
    asesor: ASESORES[1],
    vendedor: null,
    slaInicioEn: hoursAgo(0.5),
    ingresadoEn: hoursAgo(0.5),
    cerradoEn: null,
  },
  {
    id: "lead-09",
    cliente: {
      id: "cliente-09",
      nombre: "Gabriela Torres",
      telefonoOriginal: "0987112244",
      telefonoNormalizado: "+593987112244",
      correoPrincipal: "gabriela.torres@mail.com",
    },
    campania: CAMPANIA_CREDITOS,
    origen: "NUEVO",
    redSocial: "X",
    etapa: "CITA",
    semaforo: "VERDE",
    puntuacion: 88,
    asesor: ASESORES[0],
    vendedor: VENDEDORES[1],
    slaInicioEn: hoursAgo(5),
    ingresadoEn: hoursAgo(6),
    cerradoEn: null,
  },
  {
    id: "lead-10",
    cliente: {
      id: "cliente-10",
      nombre: "Luis Fernando Chávez",
      telefonoOriginal: "0965332211",
      telefonoNormalizado: "+593965332211",
      correoPrincipal: "luis.chavez@mail.com",
    },
    campania: CAMPANIA_LANZAMIENTO,
    origen: "REINGRESO",
    redSocial: "GOOGLE_FORMS",
    etapa: "CONTACTADO",
    semaforo: "AMARILLO",
    puntuacion: 58,
    asesor: ASESORES[1],
    vendedor: null,
    slaInicioEn: hoursAgo(19),
    ingresadoEn: hoursAgo(20),
    cerradoEn: null,
  },
  {
    id: "lead-11",
    cliente: {
      id: "cliente-11",
      nombre: "Ana Sofía Alejandra Betancourt Quiñónez de la Torre",
      telefonoOriginal: "0991234599",
      telefonoNormalizado: "+593991234599",
      correoPrincipal:
        "ana.sofia.alejandra.betancourt.quinonez.delatorre@corporativo-financiero-ejemplo.com",
    },
    campania: CAMPANIA_EXPANSION_REGIONAL,
    origen: "REINGRESO",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    semaforo: "AMARILLO",
    puntuacion: 50,
    asesor: ASESORES[1],
    vendedor: null,
    slaInicioEn: hoursAgo(2),
    ingresadoEn: hoursAgo(2),
    cerradoEn: null,
  },
];
