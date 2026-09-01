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
  redSocial: z.string().trim().min(1, "Elige una red social."),
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresa el nombre.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
});

type CrearBridgeValues = z.infer<typeof crearBridgeSchema>;

interface NuevoBridgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (valores: CrearBridgeInput) => void;
  onApiExterna: (nombre: string) => void;
  enviando: boolean;
}

/**
 * Alta de bridge (bridge-lifecycle-management, Requirement: Create Bridge).
 * El selector de red social se puebla desde `useRedesSocialesSoportadas()`
 * -- NUNCA un arreglo literal en este componente, a diferencia del
 * `REDES_SOCIALES` estático que F3 tenía antes de esta misma iniciativa
 * (ver `leads/LeadsFiltros.tsx`).
 */
export function NuevoBridgeDialog({ open, onOpenChange, onSubmit, onApiExterna, enviando }: NuevoBridgeDialogProps) {
  const { data: redesSociales, isLoading } = useRedesSocialesSoportadas();
  const {
    control,
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearBridgeValues>({
    resolver: zodResolver(crearBridgeSchema),
    defaultValues: { redSocial: "", nombre: "" },
  });
  const redSocialSeleccionada = watch("redSocial");
  // La opción es UI-only hasta que el catálogo backend incorpore API_EXTERNA.
  const redesDisponibles = Array.from(new Set([...(redesSociales ?? []), "API_EXTERNA" as RedSocial]));

  const enviar = handleSubmit((valores) => {
    if (valores.redSocial === "API_EXTERNA") {
      onApiExterna(valores.nombre);
      return;
    }
    onSubmit({ redSocial: valores.redSocial as RedSocial, nombre: valores.nombre });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo bridge</DialogTitle>
          <DialogDescription>
            Elige de dónde vienen tus leads y pon un nombre para reconocer esta conexión.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          {redSocialSeleccionada === "API_EXTERNA" ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium text-foreground">Conexión con una API propia</p>
              <p className="mt-1 text-muted-foreground">
                Sirve para traer leads desde cualquier sistema que tengas. En el próximo paso te vamos a pedir los datos de acceso.
              </p>
            </div>
          ) : null}

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
                    {redesDisponibles.map((red) => (
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
              {enviando ? "Creando…" : redSocialSeleccionada === "API_EXTERNA" ? "Configurar API" : "Crear bridge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
