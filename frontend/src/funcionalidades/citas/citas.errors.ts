import { ApiError } from "@/api/httpClient";

const CODIGOS_SOLAPAMIENTO_CITA = new Set(["cita_horario_ocupado", "cita_solapada"]);
const CODIGOS_DURACION_MINIMA_CITA = new Set(["cita_duracion_minima", "citas_duracion_minima"]);

const MENSAJE_SOLAPAMIENTO_CITA = "Ese horario ya está ocupado para este asesor. Elige otro horario.";
const MENSAJE_DURACION_MINIMA_CITA = "La cita debe durar al menos 1 hora. Ajusta la hora de finalización.";

function esMensajeSolapamientoCita(message: string): boolean {
  return /horario.*ocupad|solap/i.test(message);
}

function esMensajeDuracionMinimaCita(message: string): boolean {
  return /duraci[oó]n m[ií]nima|al menos 1 hora|citas_duracion_minima|programadaPara \+ 1h/i.test(message);
}

export function normalizeCitaSchedulingError(error: unknown): never {
  if (!(error instanceof ApiError) || error.status !== 409) {
    throw error;
  }

  if (CODIGOS_SOLAPAMIENTO_CITA.has(error.code) || esMensajeSolapamientoCita(error.message)) {
    throw new ApiError(error.code, error.status, MENSAJE_SOLAPAMIENTO_CITA);
  }

  if (CODIGOS_DURACION_MINIMA_CITA.has(error.code) || esMensajeDuracionMinimaCita(error.message)) {
    throw new ApiError(error.code, error.status, MENSAJE_DURACION_MINIMA_CITA);
  }

  throw error;
}
