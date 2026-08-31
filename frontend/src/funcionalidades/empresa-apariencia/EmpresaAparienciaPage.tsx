import { usePageHeader } from "@/layouts/PageHeaderContext";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { EmpresaAparienciaForm } from "./EmpresaAparienciaForm";
import { uploadLogoEmpresaApi } from "./empresa-apariencia.api";
import { useUpdateEmpresaApariencia } from "./useEmpresaApariencia";

/**
 * Pantalla self-service de apariencia de la PROPIA empresa
 * (`docs/blocks/d0-visualizacion-multitenant.md`, Tarea 3 -- capa de datos ya
 * existía sin UI a propósito, PASO 8 la completa). Ruta protegida
 * (`router.tsx`) para `ADMINISTRADOR` de sesión `company` exclusivamente --
 * distinta de `configuracion-empresa` (branding global de toda la instancia,
 * ver la nota de colisión conceptual en el bloque D0).
 *
 * Los valores vigentes NO se leen de un GET dedicado (no existe uno): ya
 * viajan resueltos server-side en `GET /auth/perfil`
 * (`user.empresaColorPrimario`/`empresaColorSecundario`/`empresaLogoUrl`,
 * `tipos/usuario.ts`), así que esta pantalla los toma de `useAuth()` en vez
 * de disparar una petición propia. Sin nombre editable acá: el backend
 * self-service (`PATCH /empresas/actual/apariencia`) no acepta ese campo --
 * renombrar la empresa es exclusivo del admin de holding (PASO 8, pantalla
 * separada).
 */
export function EmpresaAparienciaPage() {
  usePageHeader({ title: "Apariencia de mi empresa" });

  const { user } = useAuth();
  const actualizar = useUpdateEmpresaApariencia();

  // `ProtectedRoute` (allowedScopes=["company"]) ya garantiza sesión
  // `company` activa para esta ruta -- guarda defensiva solo para que
  // TypeScript no exija `user` opcional más abajo.
  if (!user) {
    return null;
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Personalizá los colores de marca y el isotipo que ve tu equipo, específicos de{" "}
        {user.empresaNombre ?? "tu empresa"}. Si no configurás un color propio, se usa el color
        vigente del holding.
      </p>
      <EmpresaAparienciaForm
        mostrarNombre={false}
        valoresIniciales={{
          colorPrimario: user.empresaColorPrimario,
          colorSecundario: user.empresaColorSecundario,
          logoUrl: user.empresaLogoUrl,
        }}
        enviando={actualizar.isPending}
        onSubmit={(valores) =>
          actualizar.mutate({
            colorPrimario: valores.colorPrimario,
            colorSecundario: valores.colorSecundario,
            logoUrl: valores.logoUrl,
          })
        }
        onSubirLogo={uploadLogoEmpresaApi}
      />
    </div>
  );
}
