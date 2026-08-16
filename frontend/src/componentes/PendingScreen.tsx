import { Construction } from "lucide-react";

interface PendingScreenProps {
  /** Nombre del módulo del checklist, ej. "F3 — Listado de leads". */
  module: string;
}

/**
 * Marcador de posición honesto para rutas cuyo módulo todavía no se
 * implementó (ver `docs/07-modulos-frontend.md`). Deliberadamente no
 * simula funcionalidad: F1 solo entrega el enrutado y el layout, no el
 * contenido de F2-F8.
 */
export function PendingScreen({ module }: PendingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Construction className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Módulo en construcción</p>
      <p className="text-sm text-muted-foreground">{module} todavía no está implementado.</p>
    </div>
  );
}
