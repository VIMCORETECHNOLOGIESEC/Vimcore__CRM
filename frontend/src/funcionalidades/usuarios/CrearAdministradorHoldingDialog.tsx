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
import type { CreateUsuarioInput } from "./usuarios.api";

/**
 * Sin campo `rol`: esta pantalla (`UsuariosPage.tsx`, pestaña "Usuarios" del
 * holding, fuera del contexto de una empresa puntual) solo da de alta
 * administradores DE HOLDING -- el rol viaja fijo como `"ADMINISTRADOR"`.
 * El bug de scope que rompe Asesor/Supervisor vía `POST /usuarios` genérico
 * (ver el docblock de `EmpresaUsuariosPage.tsx`) no aplica acá: este diálogo
 * nunca ofrece esos roles, y `POST /usuarios` con `rol: "ADMINISTRADOR"`
 * siempre funcionó bien (`usuarios.service.ts::createUsuario` trata
 * ADMINISTRADOR como holding-wide incondicional vía `ROLES_ACCESO_TOTAL`,
 * sin `Membresia` -- ese es justamente el comportamiento correcto para un
 * administrador de holding). Para dar de alta un administrador, supervisor o
 * asesor DE UNA EMPRESA puntual, ver `EmpresaUsuariosPage.tsx`
 * (ruta `/empresas/:empresaId/usuarios`), que usa las rutas dedicadas
 * `POST /empresas/:empresaId/{administradores,supervisores,asesores}`.
 * `password` reutiliza `passwordPolicySchema` del paquete compartido, mismo
 * criterio que `CrearAdministradorEmpresaDialog`.
 */
const crearAdministradorHoldingSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresa el nombre.").max(120, "El nombre no puede superar los 120 caracteres."),
  correo: z.string().trim().pipe(z.email("Ingresa un correo electrónico válido.")),
  password: passwordPolicySchema,
});

type CrearAdministradorHoldingValues = z.infer<typeof crearAdministradorHoldingSchema>;

interface CrearAdministradorHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (valores: CreateUsuarioInput) => void;
  enviando: boolean;
}

/**
 * Alta de administrador del holding, disparada desde `UsuariosPage.tsx`.
 * Backend real: `POST /usuarios` con `rol: "ADMINISTRADOR"` fijo por este
 * componente (`onSubmit` recibe `CreateUsuarioInput` completo para poder
 * pasarse directo a `useCreateUsuario`, mismo hook que ya usaba
 * `CrearUsuarioDialog`).
 */
export function CrearAdministradorHoldingDialog({
  open,
  onOpenChange,
  onSubmit,
  enviando,
}: CrearAdministradorHoldingDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearAdministradorHoldingValues>({
    resolver: zodResolver(crearAdministradorHoldingSchema),
  });

  const enviar = handleSubmit((valores) => {
    onSubmit({ ...valores, rol: "ADMINISTRADOR" });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo administrador del holding</DialogTitle>
          <DialogDescription>
            Completa los datos para dar de alta un administrador del holding.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-admin-holding-nombre">Nombre</Label>
            <Input
              id="crear-admin-holding-nombre"
              disabled={enviando}
              aria-invalid={errors.nombre ? "true" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p className="text-sm text-destructive">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-admin-holding-correo">Correo</Label>
            <Input
              id="crear-admin-holding-correo"
              type="email"
              disabled={enviando}
              aria-invalid={errors.correo ? "true" : undefined}
              {...register("correo")}
            />
            {errors.correo ? <p className="text-sm text-destructive">{errors.correo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crear-admin-holding-password">Contraseña inicial</Label>
            <Input
              id="crear-admin-holding-password"
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
