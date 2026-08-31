import { Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { LONGITUD_MAXIMA_MENSAJE } from "./conversaciones.api";

interface CajaRespuestaProps {
  /** Envía el texto ya recortado. Rechaza la promesa si el backend falla. */
  onEnviar: (texto: string) => Promise<unknown>;
  enviando: boolean;
}

/**
 * Duplica localmente la validación de
 * `backend/src/schemas/whatsappMessages/conversaciones.schema.ts::postMensajeBodySchema`
 * (`texto: z.string().trim().min(1).max(4_096)`) -- mismo criterio que
 * `NuevoBridgeDialog.tsx::crearBridgeSchema`. No se usa React Hook Form acá
 * a propósito: es un composer de chat con feedback instantáneo por tecla
 * (botón habilitado/deshabilitado, contador de excedido) sobre un único
 * campo controlado, no un formulario con submit diferido -- RHF no aporta
 * nada sobre ese patrón y agrega una capa de indirección al `onChange`.
 */
const mensajeSchema = z.string().trim().min(1).max(LONGITUD_MAXIMA_MENSAJE);

/**
 * Caja de respuesta del asesor. El botón queda deshabilitado si el texto
 * está vacío (tras recortar), si supera el tope del backend, o mientras hay
 * un envío en curso. Al confirmar, limpia el campo; si falla, conserva el
 * texto para reintentar (el toast de error es global).
 */
export function CajaRespuesta({ onEnviar, enviando }: CajaRespuestaProps) {
  const [texto, setTexto] = useState("");

  const recortado = texto.trim();
  const excedido = texto.length > LONGITUD_MAXIMA_MENSAJE;
  const puedeEnviar = mensajeSchema.safeParse(texto).success && !enviando;

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!puedeEnviar) return;
    try {
      await onEnviar(recortado);
      setTexto("");
    } catch {
      // Falla de envío -- el texto se conserva; el error lo muestra el toast global.
    }
  }

  return (
    <form
      className="flex items-end gap-2 border-t border-border bg-background p-3"
      onSubmit={manejarEnvio}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor="respuesta-conversacion" className="sr-only">
          Escribir mensaje
        </label>
        <textarea
          id="respuesta-conversacion"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          rows={2}
          placeholder="Escribí una respuesta…"
          aria-invalid={excedido}
          className="min-h-[2.5rem] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
        />
        {excedido ? (
          <p className="text-xs text-destructive">
            El mensaje supera el límite de {LONGITUD_MAXIMA_MENSAJE} caracteres.
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        aria-label="Enviar mensaje"
        disabled={!puedeEnviar}
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Send className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
