import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import type { CreateEmpresaAdministradorInput } from "./usuarios.api";

/**
 * Sin campo `rol`: el rol es implícito ADMINISTRADOR, fijado por el backend
 * (`createEmpresaAdministradorBodySchema` no lo declara, ver el JSDoc de
 * `createEmpresaAdministradorApi` en `usuarios.api.ts`). `password` reutiliza
 * `passwordPolicySchema` del paquete compartido, mismo criterio que
 * `CrearUsuarioDialog`.
 */
const crearAdministradorEmpresaSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre.").max(120, "El nombre no puede superar los 120 caracteres."),
  correo: z.string().trim().pipe(z.email("Ingresá un correo electrónico válido.")),
  password: passwordPolicySchema,
});

type CrearAdministradorEmpresaValues = z.infer<typeof crearAdministradorEmpresaSchema>;

interface CrearAdministradorEmpresaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (valores: CreateEmpresaAdministradorInput) => void;
  enviando: boolean;
}

/**
 * Alta de administrador de empresa (Item 23), disparada desde
 * `EmpresaDetallePage.tsx` para un holding-wide. Backend real:
 * `POST /empresas/:empresaId/administradores` (ver `usuarios.api.ts`).
 */
export function CrearAdministradorEmpresaDialog({
  open,
  onOpenChange,
  onSubmit,
  enviando,
}: CrearAdministradorEmpresaDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearAdministradorEmpresaValues>({ resolver: zodResolver(crearAdministradorEmpresaSchema) });

  const enviar = handleSubmit((valores) => {
    onSubmit(valores);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo administrador</DialogTitle>
          <DialogDescription>
            Completá los datos para dar de alta un administrador de esta empresa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-admin-nombre">Nombre</Label>
            <Input
              id="crear-admin-nombre"
              disabled={enviando}
              aria-invalid={errors.nombre ? "true" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p className="text-sm text-destructive">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-admin-correo">Correo</Label>
            <Input
              id="crear-admin-correo"
              type="email"
              disabled={enviando}
              aria-invalid={errors.correo ? "true" : undefined}
              {...register("correo")}
            />
            {errors.correo ? <p className="text-sm text-destructive">{errors.correo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-admin-password">Contraseña inicial</Label>
            <Input
              id="crear-admin-password"
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
              {enviando ? "Creando…" : "Crear administrador"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
