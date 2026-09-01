import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { passwordPolicySchema } from "schemas";
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
import { ROL_ETIQUETAS, ROLES_USUARIO_SELECCIONABLES } from "./catalogos";
import type { CreateUsuarioInput } from "./usuarios.api";

/**
 * Sin schema equivalente en `packages/schemas` para reutilizar completo:
 * `createUsuarioBodySchema` (`backend/src/schemas/usuarios.schema.ts`) usa
 * `z.enum(RolUsuario)` sobre el enum nativo de Prisma -- importarlo
 * arrastraría `@prisma/client` al bundle del frontend (misma decisión ya
 * documentada en la nota de consolidación de F2). `password` sí reutiliza
 * `passwordPolicySchema` del paquete compartido, único punto de verdad para
 * el mínimo de 12 caracteres.
 */
const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresa el nombre.").max(120, "El nombre no puede superar los 120 caracteres."),
  correo: z.string().trim().pipe(z.email("Ingresa un correo electrónico válido.")),
  rol: z.enum(ROLES_USUARIO_SELECCIONABLES, { error: "Elige un rol." }),
  password: passwordPolicySchema,
});

type CrearUsuarioValues = z.infer<typeof crearUsuarioSchema>;

interface CrearUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (valores: CreateUsuarioInput) => void;
  enviando: boolean;
}

/** Alta de usuario (F7, "Alta y edición de usuario"). Backend real: `POST /usuarios`. */
export function CrearUsuarioDialog({ open, onOpenChange, onSubmit, enviando }: CrearUsuarioDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearUsuarioValues>({ resolver: zodResolver(crearUsuarioSchema) });

  const enviar = handleSubmit((valores) => {
    onSubmit(valores);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Completa los datos para dar de alta un usuario del sistema.</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-nombre">Nombre</Label>
            <Input
              id="crear-nombre"
              disabled={enviando}
              aria-invalid={errors.nombre ? "true" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p className="text-sm text-destructive">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-correo">Correo</Label>
            <Input
              id="crear-correo"
              type="email"
              disabled={enviando}
              aria-invalid={errors.correo ? "true" : undefined}
              {...register("correo")}
            />
            {errors.correo ? <p className="text-sm text-destructive">{errors.correo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-rol">Rol</Label>
            <Controller
              control={control}
              name="rol"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={enviando}>
                  <SelectTrigger id="crear-rol" aria-label="Rol">
                    <SelectValue placeholder="Elegir rol…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES_USUARIO_SELECCIONABLES.map((rol) => (
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-password">Contraseña inicial</Label>
            <Input
              id="crear-password"
              type="password"
              autoComplete="new-password"
              disabled={enviando}
              aria-invalid={errors.password ? "true" : undefined}
              {...register("password")}
            />
            {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Creando…" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
