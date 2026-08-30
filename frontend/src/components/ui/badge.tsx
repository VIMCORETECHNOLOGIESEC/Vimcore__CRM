import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        // Estado genérico (no semáforo de lead) -- ej. bridge activo/pausado,
        // conteo de filtros avanzados. Reutiliza los tokens --success/--warning
        // ya definidos en index.css, separados a propósito de --semaforo-*
        // (ver la nota de esos tokens en index.css).
        success: "border-transparent bg-success text-success-foreground shadow hover:bg-success/80",
        warning: "border-transparent bg-warning text-warning-foreground shadow hover:bg-warning/80",
        neutral: "border-border bg-secondary text-muted-foreground",
        // Semáforo de lead: color + etiqueta de texto SIEMPRE juntos (docs/07,
        // criterios transversales -- nunca solo color). Esta variante no
        // agrega el texto por sí sola, el llamador sigue debiendo pasar la
        // etiqueta como children (ver SemaforoBadge.tsx, que además antepone
        // un punto de color). Colores literales -- no los tokens
        // semaforo-frio/tibio/caliente de tailwind.config.js -- por la misma
        // razón ya documentada en SemaforoBadge.tsx: esos tokens usan la
        // metáfora de temperatura visual con polaridad invertida respecto a
        // la lectura comercial "caliente/tibio/frío" de docs/04 §2.
        semaforoVerde: "border-green-200 bg-green-50 text-green-800",
        semaforoAmbar: "border-amber-200 bg-amber-50 text-amber-800",
        semaforoRojo: "border-red-200 bg-red-50 text-red-800",
        semaforoGris: "border-border bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
