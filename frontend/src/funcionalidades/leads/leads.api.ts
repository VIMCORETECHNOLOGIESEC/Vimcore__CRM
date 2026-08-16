import type { EstadoSla, EtapaLead, Lead, RedSocial, ResponsableLead, SemaforoLead } from "@/tipos/lead";
import type { RolUsuario } from "@/tipos/usuario";
import { ETAPAS_TERMINALES } from "./etapas";
import { calculateEstadoSla } from "./sla";
import { getResponsable } from "./leads.utils";

/**
 * Capa de datos de leads -- **mock hasta que exista el backend real** (M5,
 * `docs/06-modulos-backend.md`: `GET /api/v1/leads` con filtros, paginación
 * y orden todavía no está implementado ni siquiera como esqueleto). El
 * usuario autorizó explícitamente construir el frontend de F3+ contra datos
 * en memoria detrás de esta misma forma de función, para que conectar el
 * backend real sea reemplazar el cuerpo de `fetchLeadsApi`/
 * `assignLeadsMasivoApi`, no reescribir quien las consume (`useLeads.ts`).
 *
 * Todo punto de integración pendiente está marcado con el token
 * `INTEGRACION-BACKEND` (grepeable en todo el repo).
 */

export interface LeadsQueryParams {
  /** 1-based. */
  pagina: number;
  /**
   * INTEGRACION-BACKEND: hoy el frontend manda siempre `LEADS_POR_PAGINA`
   * (10, fijo, `LeadsPage.tsx`) -- no hay selector de tamaño de página
   * todavía. Si se agrega un `<Select>` "Leads por página" (10/25/50/100,
   * decisión pendiente de aprobación), `GET /api/v1/leads` (M5) debe validar
   * `porPagina` contra ese mismo whitelist acotado (nunca un entero libre
   * sin tope) para no permitir que el cliente pida una página gigante.
   */
  porPagina: number;
  /** Nombre, teléfono o correo (docs/07 F3, "Búsqueda"). */
  busqueda?: string;
  etapa?: EtapaLead;
  semaforo?: SemaforoLead;
  redSocial?: RedSocial;
  campaniaId?: string;
  responsableId?: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  fechaDesde?: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  fechaHasta?: string;
  estadoSla?: EstadoSla;
}

export interface LeadsResponse {
  datos: Lead[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * Restricción de cartera por rol (docs/06 M5, "Filtrado automático por rol:
 * asesor y vendedor solo ven su cartera"). En el backend real esto lo
 * resuelve el propio endpoint a partir del JWT, no un parámetro de query
 * -- se modela así en el mock porque acá no hay servidor que lea el token.
 */
export interface LeadsContextoRol {
  rol: RolUsuario;
  usuarioId: string;
}

// ---------------------------------------------------------------------------
// Datos fijos de referencia (asesores, vendedores, campañas) para que los
// filtros y la vista por rol tengan algo consistente contra qué probar.
// ---------------------------------------------------------------------------

const ASESORES = [
  { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" as const },
  { id: "asesor-2", nombre: "Julián Peña", rol: "ASESOR" as const },
];
const VENDEDORES = [
  { id: "vendedor-1", nombre: "Sofía Vintimilla", rol: "VENDEDOR" as const },
  { id: "vendedor-2", nombre: "Andrés Zambrano", rol: "VENDEDOR" as const },
];

const CAMPANIA_VERANO = { id: "camp-1", nombre: "Verano 2026" };
const CAMPANIA_LANZAMIENTO = { id: "camp-2", nombre: "Lanzamiento Q3" };
const CAMPANIA_CREDITOS = { id: "camp-3", nombre: "Campaña Créditos" };

const CUENTA_ADS_PRINCIPAL = { id: "cuenta-1", nombre: "Cuenta Ads Principal" };
const CUENTA_ADS_CREDITOS = { id: "cuenta-2", nombre: "Cuenta Ads Créditos" };

function hoursAgo(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

/**
 * Fixture en memoria. Construido con `Date.now()` en el momento de importar
 * el módulo, para que el contador de SLA y el filtro "rango de fechas"
 * siempre tengan ejemplos vigentes sin importar cuándo se ejecute la app o
 * los tests (nunca fechas absolutas fijas que quedarían viejas).
 */
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
    // El wireframe (docs/mockups/propuesta-visual.html) usa "TikTok" para
    // este ejemplo, pero `RedSocial` (docs/03 §leads) no incluye TikTok ni
    // WhatsApp -- discrepancia real entre el mockup y el modelo de datos
    // documentado, reportada en el informe de esta tarea. Se usa el valor
    // documentado más cercano para no bloquear el fixture.
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
];

function matchesBusqueda(lead: Lead, busqueda: string): boolean {
  const termino = busqueda.trim().toLowerCase();
  if (!termino) return true;
  return (
    lead.cliente.nombre.toLowerCase().includes(termino) ||
    lead.cliente.telefonoOriginal.toLowerCase().includes(termino) ||
    lead.cliente.telefonoNormalizado.toLowerCase().includes(termino) ||
    (lead.cliente.correoPrincipal?.toLowerCase().includes(termino) ?? false)
  );
}

function matchesRangoFechas(lead: Lead, fechaDesde?: string, fechaHasta?: string): boolean {
  const fechaIngreso = lead.ingresadoEn.slice(0, 10);
  if (fechaDesde && fechaIngreso < fechaDesde) return false;
  if (fechaHasta && fechaIngreso > fechaHasta) return false;
  return true;
}

function applyFiltros(
  leads: Lead[],
  params: LeadsQueryParams,
  contexto: LeadsContextoRol | undefined,
  ahora: Date,
): Lead[] {
  return leads.filter((lead) => {
    if (contexto?.rol === "ASESOR" && lead.asesor?.id !== contexto.usuarioId) return false;
    if (contexto?.rol === "VENDEDOR" && lead.vendedor?.id !== contexto.usuarioId) return false;

    if (params.busqueda && !matchesBusqueda(lead, params.busqueda)) return false;
    if (params.etapa && lead.etapa !== params.etapa) return false;
    if (params.semaforo && lead.semaforo !== params.semaforo) return false;
    if (params.redSocial && lead.redSocial !== params.redSocial) return false;
    if (params.campaniaId && lead.campania?.id !== params.campaniaId) return false;
    if (params.responsableId && getResponsable(lead)?.id !== params.responsableId) return false;
    if (!matchesRangoFechas(lead, params.fechaDesde, params.fechaHasta)) return false;
    if (
      params.estadoSla &&
      calculateEstadoSla({ slaInicioEn: lead.slaInicioEn, cerradoEn: lead.cerradoEn, ahora })
        .estado !== params.estadoSla
    ) {
      return false;
    }
    return true;
  });
}

/**
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<LeadsResponse>("/leads", { params })` cuando exista
 * `GET /api/v1/leads` (M5, docs/06-modulos-backend.md). La forma de
 * `LeadsQueryParams`/`LeadsResponse` sigue los filtros documentados ahí
 * (etapa, semáforo, red social, campaña, responsable, rango de fechas,
 * estado de SLA) más paginación -- los nombres exactos de los parámetros de
 * query son una suposición razonable (M5 no fija el contrato todavía) a
 * validar contra la implementación real del backend antes de conectar.
 * `LeadsContextoRol` desaparece en la integración real: el filtrado por rol
 * lo hace el backend a partir del JWT, no un parámetro que mande el cliente.
 */
export async function fetchLeadsApi(
  params: LeadsQueryParams,
  contexto?: LeadsContextoRol,
): Promise<LeadsResponse> {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const ahora = new Date();
  const filtrados = applyFiltros(LEADS_MOCK, params, contexto, ahora).sort(
    (a, b) => new Date(b.ingresadoEn).getTime() - new Date(a.ingresadoEn).getTime(),
  );

  const inicio = (params.pagina - 1) * params.porPagina;
  const datos = filtrados.slice(inicio, inicio + params.porPagina);

  return { datos, total: filtrados.length, pagina: params.pagina, porPagina: params.porPagina };
}

/**
 * INTEGRACION-BACKEND: reemplazar por una llamada a
 * `POST /api/v1/leads/:id/asignar` (M6, docs/06-modulos-backend.md) por
 * cada `leadId` -- M6 solo documenta el endpoint de asignación individual;
 * no hay todavía un endpoint de asignación masiva. Si el volumen de uso real
 * lo justifica, es una decisión de backend agregar uno (`POST
 * /leads/asignar-lote` o similar), no algo que este cambio de frontend deba
 * inventar. Acá se simula localmente mutando el fixture en memoria, como
 * pidió el usuario para F3+.
 */
export async function assignLeadsMasivoApi(
  leadIds: string[],
  responsableId: string,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const nuevoResponsable =
    ASESORES.find((a) => a.id === responsableId) ?? VENDEDORES.find((v) => v.id === responsableId);
  if (!nuevoResponsable) return;

  for (const lead of LEADS_MOCK) {
    if (!leadIds.includes(lead.id)) continue;
    if (nuevoResponsable.rol === "ASESOR") {
      lead.asesor = nuevoResponsable;
    } else {
      lead.vendedor = nuevoResponsable;
    }
  }
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

/**
 * Catálogo de responsables para los buscadores. `listado` es el parámetro
 * que la petición manda para acotar contra qué población buscar (ver
 * `ListadoResponsables`) -- por defecto no restringe, igual que antes.
 *
 * INTEGRACION-BACKEND: reemplazar por
 * `httpClient.get<{id;nombre}[]>("/usuarios/responsables", { params: { listado } })`
 * cuando exista (M6/M7). Si se aprueba la propuesta de `rolSecundario`
 * (multi-rol asesor/vendedor, pendiente de validar con el cliente -- riesgo
 * R6 en `01-alcance-mvp.md`), `"VENDEDORES"` pasa a resolver contra el rol
 * *efectivo* (`rol === "VENDEDOR"` o `rolSecundario === "VENDEDOR"`), no solo
 * `rol` -- ese cambio queda contenido acá, ningún llamador necesita tocarse.
 */
export function getCatalogoResponsables(
  listado: ListadoResponsables = "TODOS",
): { id: string; nombre: string }[] {
  const fuente =
    listado === "ASESORES" ? ASESORES : listado === "VENDEDORES" ? VENDEDORES : [...ASESORES, ...VENDEDORES];
  return fuente.map(({ id, nombre }) => ({ id, nombre }));
}

export function getCatalogoCampanias(): { id: string; nombre: string }[] {
  return [CAMPANIA_VERANO, CAMPANIA_LANZAMIENTO, CAMPANIA_CREDITOS];
}

/**
 * Igual que `getCatalogoResponsables`, pero conservando `rol` -- lo usa F4
 * (`leadDetalle.api.ts`) para decidir a qué campo del `Lead` (`asesor` o
 * `vendedor`) escribir al reasignar.
 */
export function getCatalogoResponsablesConRol(): ResponsableLead[] {
  return [...ASESORES, ...VENDEDORES];
}

/**
 * Solo vendedores, para el traspaso (F4) -- atajo de
 * `getCatalogoResponsables("VENDEDORES")`. Cuando el asesor traspasa su
 * propio lead sin elegir vendedor, `handoffToVendedorApi` usa el primero de
 * esta lista como simplificación de "algoritmo de menor carga" -- ver el
 * comentario ahí.
 */
export function getCatalogoVendedores(): { id: string; nombre: string }[] {
  return getCatalogoResponsables("VENDEDORES");
}

/**
 * Leads activos (no en etapa terminal) donde `usuarioId` es el responsable
 * operativo *vigente* -- `getResponsable()`, no `asesor`/`vendedor` por
 * separado, mismo criterio que ya usa F5 para "leads por asesor": un lead
 * traspasado cuenta para el vendedor que lo recibió, no para el asesor
 * original (F7, "carga activa de leads"). Reutilizado por
 * `funcionalidades/usuarios/usuarios.api.ts` para el listado y para la
 * reasignación obligatoria en la baja lógica -- ver el comentario de brecha
 * ahí sobre por qué esto solo produce datos reales contra los ids
 * sintéticos de este mismo mock (`asesor-1`, `vendedor-1`, etc.), no contra
 * ids reales de `GET /usuarios`.
 */
export function getLeadsActivosDeUsuario(usuarioId: string): Lead[] {
  return LEADS_MOCK.filter(
    (lead) => !ETAPAS_TERMINALES.includes(lead.etapa) && getResponsable(lead)?.id === usuarioId,
  );
}
