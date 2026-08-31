import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cierreNoVentaOportunidadSchema,
  type CierreNoVentaOportunidadFormValues,
} from "./cierre.schemas";

interface CierreNoVentaFormProps {
  /** Igual patrón que `CierreVentaForm`: solo valida y entrega los valores. */
  onValidSubmit: (valores: CierreNoVentaOportunidadFormValues) => void;
}

/** Formulario de cierre en No Venta de una Oportunidad (Bloque D, D7). */
export function CierreNoVentaForm({ onValidSubmit }: CierreNoVentaFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CierreNoVentaOportunidadFormValues>({
    resolver: zodResolver(cierreNoVentaOportunidadSchema),
  });

  const longitudObservacion = watch("observacionCierre")?.length ?? 0;

  return (
    <form
      onSubmit={handleSubmit((valores) => onValidSubmit(valores))}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="observacionCierre">Observación del motivo (mínimo 20 caracteres)</Label>
        <Textarea id="observacionCierre" rows={4} {...register("observacionCierre")} />
        <span className="text-xs text-muted-foreground">
          {longitudObservacion}/20 caracteres mínimos
        </span>
        {errors.observacionCierre ? (
          <p className="text-sm text-destructive">{errors.observacionCierre.message}</p>
        ) : null}
      </div>

      <Button type="submit" variant="destructive" className="w-fit">
        Cerrar como No Venta
      </Button>
    </form>
  );
}
