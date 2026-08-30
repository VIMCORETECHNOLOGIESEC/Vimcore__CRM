import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORMA_PAGO_ETIQUETAS } from "../catalogos";
import { cierreVentaOportunidadSchema, type CierreVentaOportunidadFormValues } from "./cierre.schemas";

interface CierreVentaFormProps {
  /**
   * El formulario solo valida y entrega los valores -- no muta. La decisión
   * de negocio de *cuándo* confirmar y disparar `POST .../cerrar` vive en
   * `OportunidadCierrePanel` (ConfirmDialog + `useCerrarOportunidad`), igual
   * que el patrón de dos pasos de `leads/detalle/CierreVentaForm.tsx`.
   */
  onValidSubmit: (valores: CierreVentaOportunidadFormValues) => void;
}

/** Formulario de cierre en Venta de una Oportunidad (Bloque D, D7). */
export function CierreVentaForm({ onValidSubmit }: CierreVentaFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CierreVentaOportunidadFormValues>({
    resolver: zodResolver(cierreVentaOportunidadSchema),
  });

  return (
    <form
      onSubmit={handleSubmit((valores) => onValidSubmit(valores))}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="montoVenta">Monto (USD)</Label>
          <Input
            id="montoVenta"
            type="number"
            step="0.01"
            {...register("montoVenta", { valueAsNumber: true })}
          />
          {errors.montoVenta ? (
            <p className="text-sm text-destructive">{errors.montoVenta.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="formaPago">Forma de pago</Label>
          <Controller
            control={control}
            name="formaPago"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="formaPago" aria-label="Forma de pago">
                  <SelectValue placeholder="Elegir…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMA_PAGO_ETIQUETAS).map(([valor, etiqueta]) => (
                    <SelectItem key={valor} value={valor}>
                      {etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.formaPago ? (
            <p className="text-sm text-destructive">{errors.formaPago.message}</p>
          ) : null}
        </div>
      </div>

      <Button type="submit" variant="success" className="w-fit">
        Cerrar como Venta
      </Button>
    </form>
  );
}
