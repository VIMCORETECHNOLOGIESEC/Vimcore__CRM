import { cn } from "@/lib/utils";

interface NombreProductoProps {
  className?: string;
}

/** Nombre visible del producto: las letras C, R y M quedan resaltadas. */
export function NombreProducto({ className }: NombreProductoProps) {
  return (
    <span className={cn("nombre-producto-crm", className)} aria-label="VimCoRe Management">
      Vim<span className="nombre-producto-crm__highlight">C</span>o
      <span className="nombre-producto-crm__highlight">R</span>e{" "}
      <span className="nombre-producto-crm__highlight">M</span>anagement
    </span>
  );
}
