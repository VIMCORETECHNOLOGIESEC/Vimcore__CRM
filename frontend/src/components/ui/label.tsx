import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Versión sin Radix de `Label`. El componente oficial de shadcn/ui envuelve
 * `@radix-ui/react-label`, que no está en `package.json` -- AGENTS.md §2.1
 * pide declarar dependencias nuevas antes de sumarlas, no asumirlas al
 * correr la CLI de shadcn. Un `<label>` nativo con `htmlFor` cubre el mismo
 * caso de uso en los formularios de F2 sin sumar un paquete nuevo; si un
 * módulo futuro necesita el comportamiento extra de Radix (asociación
 * automática con controles sin `id`), evaluar la dependencia en ese momento.
 */
export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
)
Label.displayName = "Label"

export { Label }
