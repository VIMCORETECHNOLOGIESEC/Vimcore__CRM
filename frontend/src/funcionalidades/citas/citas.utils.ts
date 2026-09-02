import type { Cita, EstadoCita, ModalidadCita } from "@/tipos/cita";

export type VistaCalendarioCitas = "mes" | "semana" | "dia";

export const MODALIDAD_ETIQUETAS: Record<ModalidadCita, string> = {
  PRESENCIAL: "Presencial",
  VIRTUAL: "Virtual",
  TELEFONICA: "Telefónica",
};

export const ESTADO_CITA_ETIQUETAS: Record<EstadoCita, string> = {
  AGENDADA: "Agendada",
  CUMPLIDA: "Cumplida",
  NO_ASISTIO: "No asistió",
  REPROGRAMADA: "Reprogramada",
  CANCELADA: "Cancelada",
};

export const CITAS_VISTA_ETIQUETAS: Record<VistaCalendarioCitas, string> = {
  mes: "Mes",
  semana: "Semana",
  dia: "Día",
};

const MS_POR_MINUTO = 60_000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;
const MS_POR_DIA = 24 * MS_POR_HORA;
export const DURACION_MINIMA_CITA_MINUTOS = 60;

function clonarFecha(fecha: Date): Date {
  return new Date(fecha.getTime());
}

export function startOfLocalDay(fecha: Date): Date {
  const resultado = clonarFecha(fecha);
  resultado.setHours(0, 0, 0, 0);
  return resultado;
}

export function endOfLocalDay(fecha: Date): Date {
  const resultado = clonarFecha(fecha);
  resultado.setHours(23, 59, 59, 999);
  return resultado;
}

export function addDays(fecha: Date, dias: number): Date {
  const resultado = clonarFecha(fecha);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

export function addMonths(fecha: Date, meses: number): Date {
  const resultado = clonarFecha(fecha);
  resultado.setMonth(resultado.getMonth() + meses, 1);
  return resultado;
}

export function addHours(fecha: Date, horas: number): Date {
  return new Date(fecha.getTime() + horas * MS_POR_HORA);
}

export function startOfWeek(fecha: Date): Date {
  const inicio = startOfLocalDay(fecha);
  const dia = inicio.getDay();
  const offsetLunes = dia === 0 ? -6 : 1 - dia;
  return addDays(inicio, offsetLunes);
}

export function endOfWeek(fecha: Date): Date {
  return endOfLocalDay(addDays(startOfWeek(fecha), 6));
}

export function startOfMonth(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function buildVisibleRange(fechaBase: Date, vista: VistaCalendarioCitas): { desde: Date; hasta: Date } {
  if (vista === "dia") {
    return { desde: startOfLocalDay(fechaBase), hasta: endOfLocalDay(fechaBase) };
  }
  if (vista === "semana") {
    return { desde: startOfWeek(fechaBase), hasta: endOfWeek(fechaBase) };
  }
  return { desde: startOfWeek(startOfMonth(fechaBase)), hasta: endOfWeek(endOfMonth(fechaBase)) };
}

export function buildMonthDays(fechaBase: Date): Date[] {
  const { desde, hasta } = buildVisibleRange(fechaBase, "mes");
  const dias: Date[] = [];
  for (let cursor = desde; cursor.getTime() <= hasta.getTime(); cursor = addDays(cursor, 1)) {
    dias.push(cursor);
  }
  return dias;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameLocalMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function getCitaFinalizaEn(cita: Pick<Cita, "programadaPara" | "finalizaEn">): string {
  return cita.finalizaEn ?? addHours(new Date(cita.programadaPara), 1).toISOString();
}

export function ensureFinalizaEn(programadaPara: string, finalizaEn?: string): string {
  return finalizaEn && finalizaEn.trim() !== ""
    ? new Date(finalizaEn).toISOString()
    : addHours(new Date(programadaPara), 1).toISOString();
}

export function hasDuracionMinima(programadaPara: string, finalizaEn: string): boolean {
  return new Date(finalizaEn).getTime() - new Date(programadaPara).getTime() >= DURACION_MINIMA_CITA_MINUTOS * MS_POR_MINUTO;
}

export function toDatetimeLocalValue(iso: string): string {
  const fecha = new Date(iso);
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${anio}-${mes}-${dia}T${horas}:${minutos}`;
}

export function formatFechaHora(iso: string): string {
  const fecha = new Date(iso);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const horas = String(fecha.getHours()).padStart(2, "0");
  const minutos = String(fecha.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${fecha.getFullYear()} ${horas}:${minutos}`;
}

export function formatHora(iso: string): string {
  const fecha = new Date(iso);
  return `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
}

export function formatRangoHora(cita: Pick<Cita, "programadaPara" | "finalizaEn">): string {
  return `${formatHora(cita.programadaPara)}–${formatHora(getCitaFinalizaEn(cita))}`;
}

export function ordenarCitasPorInicio<T extends Pick<Cita, "programadaPara">>(citas: T[]): T[] {
  return [...citas].sort((a, b) => new Date(a.programadaPara).getTime() - new Date(b.programadaPara).getTime());
}

export function avanzarFecha(fechaBase: Date, vista: VistaCalendarioCitas, direccion: -1 | 1): Date {
  if (vista === "mes") return addMonths(fechaBase, direccion);
  if (vista === "semana") return addDays(fechaBase, 7 * direccion);
  return addDays(fechaBase, direccion);
}
