import { cn } from "@/lib/utils"

/**
 * `bg-muted` (token sólido), no `bg-primary/10`. Originalmente esto era un
 * fix puntual: el modificador de opacidad `/NN` de Tailwind no resolvía de
 * forma confiable con `--primary` como CSS var en hex plano -- verificado en
 * navegador, renderizaba `background-color: rgba(0,0,0,0)`, transparente.
 * La causa raíz ya se arregló (`index.css` ahora define cada token como
 * canales RGB crudos + `tailwind.config.js` los envuelve en
 * `rgb(var(--x) / <alpha-value>)`, ver los comentarios de ambos archivos),
 * así que `bg-primary/10` volvería a funcionar -- pero `bg-muted` se
 * mantiene igual: sigue siendo más correcto semánticamente para un skeleton
 * neutro, sin teñir de color de marca.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
