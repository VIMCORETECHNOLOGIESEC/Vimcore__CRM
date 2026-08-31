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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CanalManual, CrearLeadManualInput } from "./canal-manual.api";

/**
 * Sin reutilizar el schema de `backend/src/schemas/leads.schema.ts`
 * (`crearLeadManualBodySchema`) directamente -- no hay paquete compartido
 * entre frontend/backend (mismo criterio que el resto de los formularios de
 * este bloque, ver `LeadsFiltros.tsx`); se replica su regla acá. Contrato
 * real: `nombre` es OBLIGATORIO (no confundir con `Cliente.nombre`, que sí es
 * opcional en el modelo -- el endpoint de alta manual exige `nombre` no
 * vacío). El backend acepta teléfono O correo (al menos uno); esta pantalla
 * exige teléfono siempre, una elección de producto más estricta que el
 * mínimo del backend, no una violación de su contrato. `canalManualId`
 * obligatorio (elección de producto: un lead manual siempre queda
 * clasificado bajo un canal del catálogo).
 */
const cargarLeadManualSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresá el nombre.")
    .max(255, "El nombre no puede superar los 255 caracteres."),
  telefono: z.string().trim().min(1, "Ingresá el teléfono."),
  correo: z.union([z.string().trim().pipe(z.email("Ingresá un correo electrónico válido.")), z.literal("")]).optional(),
  canalManualId: z.string().min(1, "Elegí un canal."),
});

type CargarLeadManualValues = z.infer<typeof cargarLeadManualSchema>;

interface CargarLeadManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canales: CanalManual[];
  onSubmit: (valores: Omit<CrearLeadManualInput, "empresaId">) => void;
  enviando: boolean;
}

/**
 * "Cargar lead manual" (Bloque D, docs/blocks/d-routing-oportunidad.md, backend real).
 * Visible para Administrador, Supervisor y Asesor de una sesión `company`
 * (ver el guard en `LeadsPage.tsx`) -- carga un lead sin pasar por ningún
 * Bridge/red social, con un canal del catálogo dinámico de la empresa. Solo
 * ofrece canales ACTIVOS en el selector (un canal desactivado sigue
 * existiendo para leads históricos, pero deja de ser elegible para uno
 * nuevo -- mismo criterio que un usuario inactivo fuera de los selectores de
 * responsable).
 */
export function CargarLeadManualDialog({
  open,
  onOpenChange,
  canales,
  onSubmit,
  enviando,
}: CargarLeadManualDialogProps) {
  const canalesActivos = canales.filter((c) => c.activo);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CargarLeadManualValues>({
    resolver: zodResolver(cargarLeadManualSchema),
    // Sin esto, enviar el formulario con el Select vacío deja `canalManualId`
    // como `undefined` -- Zod rechaza el tipo ANTES de llegar al `.min(1, ...)`
    // y muestra su mensaje en inglés por defecto en vez de "Elegí un canal."
    // (AGENTS.md §2/§4, interfaz solo en español).
    defaultValues: { canalManualId: "" },
  });

  const enviar = handleSubmit((valores) => {
    onSubmit({
      nombre: valores.nombre,
      telefono: valores.telefono,
      correo: valores.correo || undefined,
      canalManualId: valores.canalManualId,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cargar lead manual</DialogTitle>
          <DialogDescription>
            Ingresá un lead directamente, sin pasar por un Bridge ni una red social.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-manual-nombre">Nombre</Label>
            <Input id="lead-manual-nombre" disabled={enviando} {...register("nombre")} />
            {errors.nombre ? <p className="text-sm text-destructive">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-manual-telefono">Teléfono</Label>
            <Input
              id="lead-manual-telefono"
              disabled={enviando}
              aria-invalid={errors.telefono ? "true" : undefined}
              {...register("telefono")}
            />
            {errors.telefono ? (
              <p className="text-sm text-destructive">{errors.telefono.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-manual-correo">Correo (opcional)</Label>
            <Input
              id="lead-manual-correo"
              type="email"
              disabled={enviando}
              aria-invalid={errors.correo ? "true" : undefined}
              {...register("correo")}
            />
            {errors.correo ? <p className="text-sm text-destructive">{errors.correo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-manual-canal">Canal</Label>
            <Controller
              control={control}
              name="canalManualId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={enviando}>
                  <SelectTrigger id="lead-manual-canal" aria-label="Canal">
                    <SelectValue placeholder="Elegir canal…" />
                  </SelectTrigger>
                  <SelectContent>
                    {canalesActivos.map((canal) => (
                      <SelectItem key={canal.id} value={canal.id}>
                        {canal.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.canalManualId ? (
              <p className="text-sm text-destructive">{errors.canalManualId.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Cargando…" : "Cargar lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
