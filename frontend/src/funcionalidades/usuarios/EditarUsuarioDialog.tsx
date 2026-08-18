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
import { ROLES_USUARIO, type AdminUsuario } from "@/tipos/usuario";
import { ROL_ETIQUETAS } from "./catalogos";
import type { UpdateUsuarioInput } from "./usuarios.api";

/** Mismos campos que `CrearUsuarioDialog`, sin `password` -- ver `RestablecerPasswordDialog.tsx`. */
const editarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre.").max(120, "El nombre no puede superar los 120 caracteres."),
  correo: z.string().trim().pipe(z.email("Ingresá un correo electrónico válido.")),
  rol: z.enum(ROLES_USUARIO, { error: "Elegí un rol." }),
});

type EditarUsuarioValues = z.infer<typeof editarUsuarioSchema>;

interface EditarUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: AdminUsuario;
  onSubmit: (valores: UpdateUsuarioInput) => void;
  enviando: boolean;
}

/** Edición de usuario (F7, "Alta y edición de usuario"). Backend real: `PATCH /usuarios/:id`. */
export function EditarUsuarioDialog({
  open,
  onOpenChange,
  usuario,
  onSubmit,
  enviando,
}: EditarUsuarioDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EditarUsuarioValues>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: { nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
  });

  const enviar = handleSubmit((valores) => {
    onSubmit(valores);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>Actualizá los datos de {usuario.nombre}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editar-nombre">Nombre</Label>
            <Input
              id="editar-nombre"
              disabled={enviando}
              aria-invalid={errors.nombre ? "true" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p className="text-sm text-destructive">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editar-correo">Correo</Label>
            <Input
              id="editar-correo"
              type="email"
              disabled={enviando}
              aria-invalid={errors.correo ? "true" : undefined}
              {...register("correo")}
            />
            {errors.correo ? <p className="text-sm text-destructive">{errors.correo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editar-rol">Rol</Label>
            <Controller
              control={control}
              name="rol"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={enviando}>
                  <SelectTrigger id="editar-rol" aria-label="Rol">
                    <SelectValue placeholder="Elegir rol…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES_USUARIO.map((rol) => (
                      <SelectItem key={rol} value={rol}>
                        {ROL_ETIQUETAS[rol]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.rol ? <p className="text-sm text-destructive">{errors.rol.message}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
