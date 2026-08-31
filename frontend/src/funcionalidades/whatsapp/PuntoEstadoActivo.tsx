/**
 * Punto verde titilante -- indicador puramente visual de "conexión activa"
 * (`ConectarWhatsAppCard.tsx`). SIEMPRE se usa junto a un texto explícito
 * ("Conectado a {numero}"), nunca solo -- por eso va `aria-hidden`: el color
 * nunca es el único portador de significado (docs/07, criterio transversal
 * de accesibilidad). Mismos tokens de verde que `EstadoBridgeBadge.tsx`.
 * Componente de presentación puro, sin lógica -- no requiere test unitario
 * per AGENTS.md §5.
 */
export function PuntoEstadoActivo() {
  return (
    <span className="relative flex size-2.5" aria-hidden="true">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
    </span>
  );
}
