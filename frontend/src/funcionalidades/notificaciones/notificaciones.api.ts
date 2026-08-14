import type { Notificacion, TipoNotificacion } from "@/tipos/notificacion";
import { LEADS_MOCK } from "@/funcionalidades/leads/leads.api";
import { sortByFechaDesc } from "./notificaciones.utils";

/**
 * Capa de datos de notificaciones -- **mock hasta que exista el backend
 * real** (M8, `docs/06-modulos-backend.md`: `GET /api/v1/notificaciones`,
 * `PATCH /api/v1/notificaciones/:id/leer` y el canal SSE `GET
 * /api/v1/eventos` no existen todavía ni como esqueleto). Misma forma de
 * función que tendrá la integración real, para que conectar el backend sea
 * reemplazar el cuerpo de estas funciones, no reescribir quien las consume
 * (`useNotificaciones.ts`, `CampanaNotificaciones.tsx`).
 *
 * Todo punto de integración pendiente está marcado con el token
 * `INTEGRACION-BACKEND` (grepeable en todo el repo).
 *
 * **Decisión de mock propia del frontend:** a diferencia de `leads.api.ts`
 * (que arma un fixture fijo con ids de usuario inventados, `asesor-1`,
 * `vendedor-1`...), acá no existe un catálogo de usuarios reales contra el
 * cual anclar notificaciones -- F2 autentica contra el backend real y el
 * `id` del usuario logueado es el que emite ese backend, no uno inventado
 * por este mock. Por eso las notificaciones se **siembran de forma perezosa
 * por `usuarioId`** la primera vez que se piden (`seedParaUsuario`): quien
 * sea que inicie sesión ve un set de ejemplo variado (con y sin lead
 * asociado, leídas y no leídas), y las mutaciones (`markNotificacionLeidaApi`,
 * `markAllNotificacionesLeidasApi`) persisten sobre ese mismo estado en
 * memoria durante la sesión del navegador.
 */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hoursAgo(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

const notificacionesPorUsuario = new Map<string, Notificacion[]>();

function seedParaUsuario(usuarioId: string): Notificacion[] {
  const [leadUno, leadDos, leadTres] = LEADS_MOCK;

  const base: Array<Omit<Notificacion, "usuarioId">> = [
    {
      id: `${usuarioId}-notif-1`,
      tipo: "LEAD_ASIGNADO",
      canal: "IN_APP",
      titulo: "Nuevo lead asignado",
      mensaje: `Se te asignó el lead de ${leadUno.cliente.nombre}.`,
      leadId: leadUno.id,
      leidaEn: null,
      creadaEn: hoursAgo(0.1),
    },
    {
      id: `${usuarioId}-notif-2`,
      tipo: "RECORDATORIO_CITA",
      canal: "IN_APP",
      titulo: "Recordatorio de cita",
      mensaje: `Tienes una cita con ${leadDos.cliente.nombre} en 1 hora.`,
      leadId: leadDos.id,
      leidaEn: null,
      creadaEn: hoursAgo(0.5),
    },
    {
      id: `${usuarioId}-notif-3`,
      tipo: "LEAD_SIN_ATENDER",
      canal: "IN_APP",
      titulo: "Lead sin atender hace 24 h",
      mensaje: `El lead de ${leadTres.cliente.nombre} lleva más de 24 horas sin gestión.`,
      leadId: leadTres.id,
      leidaEn: hoursAgo(2),
      creadaEn: hoursAgo(6),
    },
    {
      id: `${usuarioId}-notif-4`,
      tipo: "ERROR_BRIDGE",
      canal: "IN_APP",
      titulo: "Error de recepción en un bridge",
      mensaje: "El bridge de Facebook Lead Ads no pudo procesar el último lead recibido.",
      leadId: null,
      leidaEn: null,
      creadaEn: hoursAgo(9),
    },
    {
      id: `${usuarioId}-notif-5`,
      tipo: "TOKEN_POR_EXPIRAR",
      canal: "IN_APP",
      titulo: "Token próximo a expirar",
      mensaje: "El token de la cuenta publicitaria de Instagram expira en 7 días.",
      leadId: null,
      leidaEn: hoursAgo(20),
      creadaEn: hoursAgo(30),
    },
  ];

  return base.map((notificacion) => ({ ...notificacion, usuarioId }));
}

function getListaUsuario(usuarioId: string): Notificacion[] {
  let lista = notificacionesPorUsuario.get(usuarioId);
  if (!lista) {
    lista = seedParaUsuario(usuarioId);
    notificacionesPorUsuario.set(usuarioId, lista);
  }
  return lista;
}

/**
 * INTEGRACION-BACKEND: reemplazar por `httpClient.get<Notificacion[]>("/notificaciones",
 * { params: { no_leidas: soloNoLeidas } })` cuando exista `GET
 * /api/v1/notificaciones` (M8). `usuarioId` desaparece como parámetro en la
 * integración real: el backend lo resuelve del JWT, igual que
 * `LeadsContextoRol` en `leads.api.ts`.
 */
export async function fetchNotificacionesApi(
  usuarioId: string,
  soloNoLeidas = false,
): Promise<Notificacion[]> {
  await delay(150);

  const lista = getListaUsuario(usuarioId);
  const filtradas = soloNoLeidas ? lista.filter((n) => !n.leidaEn) : lista;
  return sortByFechaDesc(filtradas);
}

/**
 * INTEGRACION-BACKEND: reemplazar por `httpClient.patch("/notificaciones/:id/leer")`
 * cuando exista `PATCH /api/v1/notificaciones/:id/leer` (M8).
 */
export async function markNotificacionLeidaApi(
  usuarioId: string,
  notificacionId: string,
): Promise<void> {
  await delay(100);

  const lista = getListaUsuario(usuarioId);
  const notificacion = lista.find((n) => n.id === notificacionId);
  if (notificacion && !notificacion.leidaEn) {
    notificacion.leidaEn = new Date().toISOString();
  }
}

/**
 * INTEGRACION-BACKEND: M8 (docs/06-modulos-backend.md) solo documenta
 * "marcado masivo" en el ítem del `PATCH /api/v1/notificaciones/:id/leer" --
 * no fija el endpoint exacto para marcar todas a la vez (ej. `PATCH
 * /notificaciones/leer-todas` o un `POST` separado). Es una decisión de
 * backend pendiente, no algo que este cambio de frontend deba inventar.
 */
export async function markAllNotificacionesLeidasApi(usuarioId: string): Promise<void> {
  await delay(100);

  const lista = getListaUsuario(usuarioId);
  const ahora = new Date().toISOString();
  for (const notificacion of lista) {
    if (!notificacion.leidaEn) notificacion.leidaEn = ahora;
  }
}

/** Solo para tests: reinicia el estado en memoria entre casos. */
export function _resetNotificacionesMockParaTests(): void {
  notificacionesPorUsuario.clear();
}

export type { TipoNotificacion };
