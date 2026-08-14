import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { passwordPolicySchema } from "schemas";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RolUsuario } from "@/tipos/usuario";
import { useAuth } from "./AuthContext";
import { changePasswordApi } from "./autenticacion.api";

const ETIQUETAS_ROL: Record<RolUsuario, string> = {
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  ASESOR: "Asesor",
  VENDEDOR: "Vendedor",
};

// Política de contraseña reutilizada de `packages/schemas`, mismo piso que
// `backend/src/schemas/usuarios.schema.ts` (AGENTS.md: reutilizar los
// esquemas del backend). `confirmarPassword` es una validación puramente
// de UI, no tiene contraparte en el backend.
const cambiarPasswordSchema = z
  .object({
    password: passwordPolicySchema,
    confirmarPassword: z.string().min(1, "Confirmá la nueva contraseña."),
  })
  .refine((valores) => valores.password === valores.confirmarPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmarPassword"],
  });

type CambiarPasswordValues = z.infer<typeof cambiarPasswordSchema>;

/** Pantalla de perfil con cambio de contraseña (F2, docs/07). */
export function PerfilPage() {
  const { user } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CambiarPasswordValues>({ resolver: zodResolver(cambiarPasswordSchema) });

  const onSubmit = handleSubmit(async (valores) => {
    if (!user) {
      return;
    }
    try {
      await changePasswordApi(user.id, valores.password);
      toast.success("Contraseña actualizada correctamente.");
      reset();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  // `ProtectedRoute` ya garantiza sesión activa para esta ruta -- guarda
  // defensiva solo para que TypeScript no exija `user` opcional más abajo.
  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <section className="rounded-lg border border-border bg-background p-6">
        <h1 className="text-lg font-semibold text-foreground">Mi perfil</h1>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Nombre</dt>
          <dd className="text-foreground">{user.nombre}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd className="text-foreground">{user.correo}</dd>
          <dt className="text-muted-foreground">Rol</dt>
          <dd className="text-foreground">{ETIQUETAS_ROL[user.rol]}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-background p-6">
        <h2 className="text-base font-semibold text-foreground">Cambiar contraseña</h2>
        <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              disabled={isSubmitting}
              {...register("password")}
            />
            {errors.password ? (
              <p id="password-error" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmarPassword">Confirmar nueva contraseña</Label>
            <Input
              id="confirmarPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.confirmarPassword ? "true" : undefined}
              aria-describedby={errors.confirmarPassword ? "confirmarPassword-error" : undefined}
              disabled={isSubmitting}
              {...register("confirmarPassword")}
            />
            {errors.confirmarPassword ? (
              <p id="confirmarPassword-error" className="text-sm text-destructive">
                {errors.confirmarPassword.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting ? "Actualizando…" : "Actualizar contraseña"}
          </Button>
        </form>
      </section>
    </div>
  );
}
