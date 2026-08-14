import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/componentes/ConfirmDialog";
import { cierreVentaSchema, type CierreVentaFormValues } from "./cierre.schemas";
import { useSubmitCierreVenta } from "./useLeadDetalle";

interface CierreVentaFormProps {
  leadId: string;
}

const FORMA_PAGO_ETIQUETAS: Record<CierreVentaFormValues["formaPago"], string> = {
  CONTADO: "Contado",
  CREDITO: "Crédito",
  FINANCIAMIENTO: "Financiamiento",
};

/**
 * Cierre en Venta (F4, docs/02-reglas-negocio.md): fecha, monto, producto y
 * forma de pago obligatorios; observaciones opcionales. RHF + Zod
 * (`cierre.schemas.ts`). Cerrar un lead es irreversible (VENTA/NO_VENTA no
 * se reabren) -- exige confirmación explícita antes de enviar (docs/07,
 * criterio transversal).
 */
export function CierreVentaForm({ leadId }: CierreVentaFormProps) {
  const [confirmando, setConfirmando] = useState(false);
  const submitCierre = useSubmitCierreVenta(leadId);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CierreVentaFormValues>({ resolver: zodResolver(cierreVentaSchema) });

  const onValidSubmit = handleSubmit(() => setConfirmando(true));

  function confirm() {
    handleSubmit((valores) => {
      submitCierre.mutate(
        {
          fechaCierre: valores.fechaCierre,
          montoVenta: valores.montoVenta,
          productoVendido: valores.productoVendido,
          formaPago: valores.formaPago,
          observaciones: valores.observaciones,
        },
        { onSuccess: () => setConfirmando(false) },
      );
    })();
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Cierre — Venta</h2>

      <form onSubmit={onValidSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fechaCierre">Fecha de cierre</Label>
            <Input id="fechaCierre" type="date" {...register("fechaCierre")} />
            {errors.fechaCierre ? (
              <p className="text-sm text-destructive">{errors.fechaCierre.message}</p>
            ) : null}
          </div>

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
            <Label htmlFor="productoVendido">Producto o servicio</Label>
            <Input id="productoVendido" {...register("productoVendido")} />
            {errors.productoVendido ? (
              <p className="text-sm text-destructive">{errors.productoVendido.message}</p>
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="observaciones">Observaciones (opcional)</Label>
          <Textarea id="observaciones" {...register("observaciones")} />
        </div>

        <Button type="submit" className="w-fit">
          Cerrar como Venta
        </Button>
      </form>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Confirmar cierre como Venta"
        description="Esta acción es irreversible: un lead cerrado en Venta o No Venta no vuelve a reabrirse. Verificá los datos antes de confirmar."
        confirmLabel="Cerrar como Venta"
        confirming={submitCierre.isPending}
        onConfirm={confirm}
      />
    </section>
  );
}
