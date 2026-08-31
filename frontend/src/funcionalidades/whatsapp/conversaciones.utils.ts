import type { ConversacionListItem, Mensaje } from "@/tipos/conversacion";

/**
 * Utilidades de presentación de la bandeja de conversaciones -- lógica pura y
 * testeada (formato de fecha, nombre a mostrar, ordenado cronológico del
 * historial). Los componentes las consumen sin volver a implementarlas.
 */

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const FORMATO_HORA = new Intl.DateTimeFormat("es", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * `DD/MM/AAAA HH:mm` en la zona horaria local del navegador (docs/07,
 * criterios transversales de calidad). `null` -> "Sin actividad";
 * una fecha inválida -> "" (no revienta la fila).
 */
export function formatearFechaHora(iso: string | null | undefined): string {
  if (!iso) return "Sin actividad";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return FORMATO_FECHA_HORA.format(fecha).replace(", ", " ");
}

/** `HH:mm` local, para la marca de tiempo bajo cada burbuja de mensaje. */
export function formatearHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return FORMATO_HORA.format(fecha);
}

/**
 * Nombre a mostrar de una conversación: nombre del cliente, si no su
 * teléfono, y si no un texto honesto en vez de un hueco vacío.
 */
export function nombreConversacion(
  conversacion: Pick<ConversacionListItem, "clienteNombre" | "clienteTelefono">,
): string {
  const nombre = conversacion.clienteNombre?.trim();
  if (nombre) return nombre;
  const telefono = conversacion.clienteTelefono?.trim();
  if (telefono) return telefono;
  return "Cliente sin identificar";
}

/**
 * Combina páginas del historial (cada una llega `enviadoEn` desc) en una
 * lista cronológica ascendente sin duplicados (viejo arriba / nuevo abajo,
 * convención de chat). Deduplica por `id` -- una recarga tras invalidación
 * puede traer mensajes ya conocidos.
 */
export function combinarHistorial(paginas: readonly Mensaje[][]): Mensaje[] {
  const porId = new Map<string, Mensaje>();
  for (const pagina of paginas) {
    for (const mensaje of pagina) {
      porId.set(mensaje.id, mensaje);
    }
  }
  return [...porId.values()].sort(
    (a, b) => Date.parse(a.enviadoEn) - Date.parse(b.enviadoEn),
  );
}
