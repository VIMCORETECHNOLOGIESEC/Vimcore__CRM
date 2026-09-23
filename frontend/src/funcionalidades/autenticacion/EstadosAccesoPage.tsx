import { useEffect, useState, type ReactNode } from "react";
import { getAuthLoginUrl, redirectToAuth } from "@/api/httpClient";
import { Button } from "@/components/ui/button";

function PantallaAcceso({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
      {descripcion ? (
        <p className="max-w-md text-sm text-muted-foreground">{descripcion}</p>
      ) : null}
      {children}
    </main>
  );
}

/**
 * TEMPORAL (T5, decisión de producto abierta: onboarding vs. alta automática
 * vs. vínculo manual): 403 `CRM_IDENTITY_NOT_LINKED`. Sin formulario de
 * login y sin redirección automática -- solo un enlace de vuelta al frontend
 * de auth, para no generar un bucle auth <-> CRM.
 */
export function IdentidadNoVinculadaPage() {
  return (
    <PantallaAcceso
      titulo="Tu cuenta aún no está vinculada al CRM"
      descripcion="Iniciaste sesión en la plataforma, pero tu cuenta todavía se está vinculando al CRM. Intenta nuevamente en unos minutos o contacta a un administrador si el problema continúa."
    >
      <Button asChild>
        <a href={getAuthLoginUrl()}>Volver al inicio de sesión</a>
      </Button>
    </PantallaAcceso>
  );
}

/** Error de arranque distinto de 401/403 (p. ej. 502 `UPSTREAM_ERROR`): sin redirección, con reintento. */
export function ErrorArranquePage() {
  return (
    <PantallaAcceso
      titulo="No pudimos cargar tu sesión"
      descripcion="Ocurrió un error al conectar con el servidor. Intenta nuevamente en unos segundos."
    >
      <Button onClick={() => window.location.reload()}>Reintentar</Button>
    </PantallaAcceso>
  );
}

/**
 * Sin sesión de plataforma: redirige al frontend de auth. Si la guarda
 * anti-bucle de `redirectToAuth` lo frena (rebote auth -> CRM -> auth), deja
 * un enlace manual en vez de redirigir otra vez.
 */
export function SinSesionPage() {
  const [redirigido, setRedirigido] = useState(true);
  useEffect(() => {
    setRedirigido(redirectToAuth());
  }, []);
  return redirigido ? (
    <PantallaAcceso titulo="Redirigiendo al inicio de sesión…" />
  ) : (
    <PantallaAcceso
      titulo="No se pudo iniciar tu sesión en el CRM"
      descripcion="La plataforma no nos entregó una sesión válida. Vuelve a iniciar sesión."
    >
      <Button asChild>
        <a href={getAuthLoginUrl()}>Ir al inicio de sesión</a>
      </Button>
    </PantallaAcceso>
  );
}

/** Ruta `/iniciar-sesion` (favoritos viejos): el CRM ya no tiene login propio. */
export const IniciarSesionRedirect = SinSesionPage;
