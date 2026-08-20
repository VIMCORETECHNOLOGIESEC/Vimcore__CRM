import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router";
import { loginBodySchema } from "schemas";
import { z } from "zod";
import arcanoIsotipo from "@/assets/arcano-isotipo.png";
import { getErrorMessage } from "@/api/httpClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "./AuthContext";
import { getLandingRoute } from "./permissions";

type LoginFormValues = z.infer<typeof loginBodySchema>;

interface LocationState {
  /** Ruta a la que intentaba entrar antes de que `ProtectedRoute` lo mandara a login. */
  desde?: string;
}

/** Pantalla de inicio de sesión (F2, docs/07). */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginBodySchema) });

  const onSubmit = handleSubmit(async (valores) => {
    setErrorEnvio(null);
    try {
      const usuario = await login(valores.correo, valores.password);
      // Si `ProtectedRoute` mandó al usuario a login por intentar entrar a
      // una ruta específica, vuelve ahí; si no, va a la landing de su rol.
      const desde = (location.state as LocationState | null)?.desde;
      navigate(desde ?? getLandingRoute(usuario.rol), { replace: true });
    } catch (error) {
      setErrorEnvio(getErrorMessage(error));
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-8 shadow-sm border-t-[3px] [border-top-color:var(--arcano-gold)]">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src={arcanoIsotipo} alt="" aria-hidden="true" className="h-12 w-auto" />
          <h1 className="text-center text-xl font-semibold text-foreground">
            ARCANO CRM
          </h1>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {errorEnvio ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo iniciar sesión</AlertTitle>
              <AlertDescription>{errorEnvio}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="correo">Correo electrónico</Label>
            <Input
              id="correo"
              type="email"
              autoComplete="username"
              aria-invalid={errors.correo ? "true" : undefined}
              aria-describedby={errors.correo ? "correo-error" : undefined}
              disabled={isSubmitting}
              {...register("correo")}
            />
            {errors.correo ? (
              <p id="correo-error" className="text-sm text-destructive">
                {errors.correo.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
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

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            {isSubmitting ? "Ingresando…" : "Iniciar sesión"}
          </Button>
        </form>
      </div>
    </main>
  );
}
