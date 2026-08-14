import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/componentes/ConfirmDialog";
import { cierreNoVentaSchema, type CierreNoVentaFormValues } from "./cierre.schemas";
import { useSubmitCierreNoVenta } from "./useLeadDetalle";

interface CierreNoVentaFormProps {
  leadId: string;
}

/**
 * Cierre en No Venta (F4, docs/02-reglas-negocio.md): fecha obligatoria y
 * observación del motivo en texto libre, sin catálogo, mínimo 20 caracteres
 * (`cierre.schemas.ts`). Irreversible -- exige confirmación explícita.
 */
export function CierreNoVentaForm({ leadId }: CierreNoVentaFormProps) {
  const [confirmando, setConfirmando] = useState(false);
  const submitCierre = useSubmitCierreNoVenta(leadId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CierreNoVentaFormValues>({ resolver: zodResolver(cierreNoVentaSchema) });

  const onValidSubmit = handleSubmit(() => setConfirmando(true));
  const longitudObservacion = watch("observacionMotivo")?.length ?? 0;

  function confirm() {
    handleSubmit((valores) => {
      submitCierre.mutate(
        { fechaCierre: valores.fechaCierre, observacionMotivo: valores.observacionMotivo },
        { onSuccess: () => setConfirmando(false) },
      );
    })();
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Cierre — No Venta</h2>

      <form onSubmit={onValidSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fechaCierreNoVenta">Fecha de cierre</Label>
          <Input id="fechaCierreNoVenta" type="date" {...register("fechaCierre")} />
          {errors.fechaCierre ? (
            <p className="text-sm text-destructive">{errors.fechaCierre.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="observacionMotivo">Observación del motivo (mínimo 20 caracteres)</Label>
          <Textarea id="observacionMotivo" rows={4} {...register("observacionMotivo")} />
          <span className="text-xs text-muted-foreground">{longitudObservacion}/20 caracteres mínimos</span>
          {errors.observacionMotivo ? (
            <p className="text-sm text-destructive">{errors.observacionMotivo.message}</p>
          ) : null}
        </div>

        <Button type="submit" variant="destructive" className="w-fit">
          Cerrar como No Venta
        </Button>
      </form>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Confirmar cierre como No Venta"
        description="Esta acción es irreversible: un lead cerrado en Venta o No Venta no vuelve a reabrirse. Verificá los datos antes de confirmar."
        confirmLabel="Cerrar como No Venta"
        confirming={submitCierre.isPending}
        onConfirm={confirm}
      />
    </section>
  );
}
