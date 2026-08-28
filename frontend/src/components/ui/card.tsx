import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva("rounded-lg border bg-card text-card-foreground shadow-sm", {
  variants: {
    variant: {
      /** Tarjeta genérica, borde uniforme en los cuatro lados. */
      default: "",
      /**
       * KPI card con pestaña de color en el borde izquierdo -- nunca fondo
       * sólido de color, el color es acento, no relleno (docs de línea
       * gráfica, dirección "Consejo directivo"/Propuesta B). El color en sí
       * NO es un token fijo de este componente base: cada tema/variante
       * decide su propia paleta y la pasa vía `accentColor`, variando por
       * categoría de KPI en vez de repetir un único color en todas las
       * tarjetas (riesgo ya señalado: "misma card × 7").
       */
      accent: "border-l-4",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /**
   * Color CSS (hex, `rgb()`, variable) de la pestaña izquierda. Requerido
   * para que `variant="accent"` se vea distinto de una tarjeta genérica;
   * ignorado en `variant="default"`.
   */
  accentColor?: string
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, accentColor, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      style={
        variant === "accent" && accentColor
          ? { borderLeftColor: accentColor, ...style }
          : style
      }
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-sm font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-xs text-muted-foreground", className)} {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
  )
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
