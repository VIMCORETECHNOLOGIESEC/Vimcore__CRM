import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RedSocial } from "@/tipos/lead";
import type { CrearBridgeInput } from "@/tipos/bridge";
import { RED_SOCIAL_ETIQUETAS } from "./catalogos";
import { useRedesSocialesSoportadas } from "./useBridges";

/**
 * Sin `z.enum` sobre `RedSocial`: el catálogo de red sociales elegibles es
 * DINÁMICO, vía `useRedesSocialesSoportadas()` (Requirement: Backend-Driven
 * Creation Catalog) -- validar contra una lista fija en el propio schema
 * reintroduciría exactamente el hardcodeo que ese requerimiento prohíbe.
 */
const crearBridgeSchema = z.object({
  redSocial: z.string().trim().min(1, "Elegí una red social."),
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
});

type CrearBridgeValues = z.infer<typeof crearBridgeSchema>;

interface NuevoBridgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (valores: CrearBridgeInput) => void;
  enviando: boolean;
}

/**
 * Alta de bridge (bridge-lifecycle-management, Requirement: Create Bridge).
 * El selector de red social se puebla desde `useRedesSocialesSoportadas()`
 * -- NUNCA un arreglo literal en este componente, a diferencia del
 * `REDES_SOCIALES` estático que F3 tenía antes de esta misma iniciativa
 * (ver `leads/LeadsFiltros.tsx`).
 */
export function NuevoBridgeDialog({ open, onOpenChange, onSubmit, enviando }: NuevoBridgeDialogProps) {
  const { data: redesSociales, isLoading } = useRedesSocialesSoportadas();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearBridgeValues>({
    resolver: zodResolver(crearBridgeSchema),
    defaultValues: { redSocial: "", nombre: "" },
  });

  const enviar = handleSubmit((valores) => {
    onSubmit({ redSocial: valores.redSocial as RedSocial, nombre: valores.nombre });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo bridge</DialogTitle>
          <DialogDescription>
            Elegí la red social y asignale un nombre para identificarlo. La clave de acceso se
            genera automáticamente al confirmar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-bridge-red-social">Red social</Label>
            <Controller
              control={control}
              name="redSocial"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={enviando || isLoading}>
                  <SelectTrigger id="nuevo-bridge-red-social" aria-label="Red social">
                    <SelectValue placeholder={isLoading ? "Cargando…" : "Elegir red social…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(redesSociales ?? []).map((red) => (
                      <SelectItem key={red} value={red}>
                        {RED_SOCIAL_ETIQUETAS[red]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.redSocial ? <p className="text-sm text-destructive">{errors.redSocial.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-bridge-nombre">Nombre</Label>
            <Input
              id="nuevo-bridge-nombre"
              disabled={enviando}
              aria-invalid={errors.nombre ? "true" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p className="text-sm text-destructive">{errors.nombre.message}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Creando…" : "Crear bridge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
