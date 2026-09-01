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
import type { AdminUsuario } from "@/tipos/usuario";

/**
 * Mismo par `password`/`confirmarPassword` que `PerfilPage.tsx` (F2):
 * `confirmarPassword` es una validación puramente de UI, sin contraparte en
 * el backend.
 */
const restablecerPasswordSchema = z
  .object({
    password: passwordPolicySchema,
    confirmarPassword: z.string().min(1, "Confirma la nueva contraseña."),
  })
  .refine((valores) => valores.password === valores.confirmarPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmarPassword"],
  });

type RestablecerPasswordValues = z.infer<typeof restablecerPasswordSchema>;

interface RestablecerPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: AdminUsuario;
  onSubmit: (password: string) => void;
  enviando: boolean;
}

/**
 * Restablecimiento de contraseña por un administrador (F7, "Restablecimiento
 * de contraseña"). A diferencia del autoservicio de F2, este flujo sí
 * funciona de punta a punta contra el backend real para cualquier usuario
 * objetivo -- ver `usuarios.api.ts::resetPasswordApi`.
 */
export function RestablecerPasswordDialog({
  open,
  onOpenChange,
  usuario,
  onSubmit,
  enviando,
}: RestablecerPasswordDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RestablecerPasswordValues>({ resolver: zodResolver(restablecerPasswordSchema) });

  const enviar = handleSubmit((valores) => {
    onSubmit(valores.password);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Definí una nueva contraseña para {usuario.nombre}. No se necesita la contraseña actual.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restablecer-password">Nueva contraseña</Label>
            <Input
              id="restablecer-password"
              type="password"
              autoComplete="new-password"
              disabled={enviando}
              aria-invalid={errors.password ? "true" : undefined}
              {...register("password")}
            />
            {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restablecer-confirmarPassword">Confirmar nueva contraseña</Label>
            <Input
              id="restablecer-confirmarPassword"
              type="password"
              autoComplete="new-password"
              disabled={enviando}
              aria-invalid={errors.confirmarPassword ? "true" : undefined}
              {...register("confirmarPassword")}
            />
            {errors.confirmarPassword ? (
              <p className="text-sm text-destructive">{errors.confirmarPassword.message}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Restableciendo…" : "Restablecer contraseña"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
