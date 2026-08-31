import { Building2, Eye, Plug, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { CONFIGURACION_EMPRESA_DEFAULT } from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";
import { CrearAdministradorEmpresaDialog } from "@/funcionalidades/usuarios/CrearAdministradorEmpresaDialog";
import { useCreateEmpresaAdministrador } from "@/funcionalidades/usuarios/useUsuarios";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { WelcomeSplashLoader } from "@/temas/variante-empresarial/WelcomeSplashLoader";
import { useEmpresaHolding } from "./useEmpresaAparienciaHolding";
import { useVistaEmpresa } from "./useVistaEmpresa";

/**
 * Duración de la transición "Ver en vivo" -- mismo total que `AppBoot.tsx`
 * (`SPLASH_SOSTENIDO_MS + SPLASH_FADE_MS` = 1500ms), declarada acá de forma
 * independiente (mismo criterio que `AppLayout.tsx::SPLASH_MIN_MS`): no hay
 * una constante compartida exportada, solo el mismo valor total para que la
 * sensación de ambas transiciones sea consistente.
 */
const DURACION_TRANSICION_VISTA_VIVA_MS = 1500;

/**
 * Detalle de empresa para un holding-wide (pantallas de gestión jerárquica
 * holding/empresa, reparto de trabajo con `crm-comercial-28`). Vista de
 * SOLO LECTURA simulada -- no cambia la sesión real.
 *
 * Las tarjetas "Usuarios"/"Bridges" navegan a rutas DEDICADAS propias
 * (`/empresas/:empresaId/usuarios`, `/empresas/:empresaId/bridges` --
 * `EmpresaUsuariosPage.tsx`/`EmpresaBridgesPage.tsx`), no al redirect
 * anterior `/usuarios?empresaId=`/`/bridges?empresaId=`: esas eran la MISMA
 * pantalla que un holding-wide usa para sus propias cuentas/bridges
 * holding-wide (mismo título, mismo ítem de sidebar resaltado, filtros que
 * no tienen sentido acá como "solo holding-wide") -- confuso para
 * distinguir "usuarios de ESTA empresa" de "mis propios usuarios
 * holding-wide". El backend ya filtra `GET /usuarios` y `GET /bridges`
 * server-side por `?empresaId=` (`listUsuariosQuerySchema`/
 * `listBridgesQuerySchema`, ver `usuarios.service.ts`/`bridge.service.ts`) --
 * las páginas dedicadas siguen reflejando scope real, no un listado completo
 * sin filtrar, solo que ahora vía el `empresaId` del path en vez del query
 * param de `useVistaEmpresa`.
 *
 * `useVistaEmpresa` (`entrarAEmpresa`/`salirDeEmpresa`, `?empresaId=` en la
 * URL) SIGUE en uso acá: otros consumidores existentes (Dashboard vía
 * `SelectorEmpresaDashboard.tsx`, Oportunidades, el botón flotante "Salir de
 * vista de empresa") todavía dependen de ese query param si el usuario
 * navega a esas pantallas después de entrar al detalle de una empresa -- no
 * se toca ese mecanismo, solo se dejó de usarlo para el link de Usuarios/
 * Bridges.
 *
 * Mismo patrón estructural que `BridgeDetallePage.tsx`: `useParams` + hook
 * de empresa puntual (`GET /empresas/:empresaId`) + `usePageHeader({title,
 * backTo})`.
 */
export function EmpresaDetallePage() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const navigate = useNavigate();
  const { entrarAEmpresa, salirDeEmpresa } = useVistaEmpresa();
  const { data: empresa, isLoading, isError, error, refetch } = useEmpresaHolding(empresaId);
  const { hasRole } = useAuth();
  const [dialogAdminAbierto, setDialogAdminAbierto] = useState(false);
  const crearAdministrador = useCreateEmpresaAdministrador(empresaId ?? "");
  // "Ver en vivo" -- cortina de transición hacia `/panel?empresaId=`, mismo
  // patrón de `LoginPage.tsx::onSubmit` (mostrar la cortina, sostenerla, y
  // recién ahí navegar -- nunca un salto brusco entre pantallas). Simplificado
  // respecto a esa versión: acá no hay un fade-in propio con
  // `requestAnimationFrame` porque el destino (`AppLayout.tsx`) ya monta SU
  // PROPIA cortina apenas resuelve `useEmpresaHolding` de la empresa vista --
  // la de acá solo necesita cubrir el instante de la navegación en sí.
  const [verEnVivoActivo, setVerEnVivoActivo] = useState(false);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!empresaId) return;
    entrarAEmpresa(empresaId);
    return () => salirDeEmpresa();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrar/salir son estables (useCallback), reintroducirlas dispara el effect en cada render.
  }, [empresaId]);

  // Cancela el timer de la cortina si el componente se desmonta antes de
  // que dispare (ej. el usuario navega fuera por otra vía mientras la
  // cortina está en curso) -- mismo criterio que `LoginPage.tsx`.
  useEffect(
    () => () => {
      for (const id of timeoutsRef.current) {
        window.clearTimeout(id);
      }
    },
    [],
  );

  usePageHeader(
    empresa ? { title: empresa.nombre, backTo: { label: "Empresas", href: "/empresas" } } : null,
  );

  function handleVerEnVivo() {
    if (!empresaId) return;
    setVerEnVivoActivo(true);
    const idNavegar = window.setTimeout(() => {
      navigate(`/panel?empresaId=${empresaId}`);
    }, DURACION_TRANSICION_VISTA_VIVA_MS);
    timeoutsRef.current.push(idNavegar);
  }

  if (!empresaId) {
    return <ErrorState message="Falta el identificador de la empresa en la URL." />;
  }

  if (isLoading) {
    return <LoadingState rows={4} rowHeight="h-16" />;
  }

  if (isError) {
    return (
      <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
    );
  }

  if (!empresa) {
    // Defensivo: un 404 real de `GET /empresas/:empresaId` ya cae en la
    // rama `isError` de arriba (`empresa_no_encontrada`), así que esta
    // rama no debería alcanzarse en la práctica -- se mantiene por si
    // `useEmpresaHolding` alguna vez resuelve con éxito sin datos.
    return <ErrorState message="No se encontró la empresa solicitada." />;
  }

  if (verEnVivoActivo) {
    // Cubre el viewport completo (`className` default de
    // `WelcomeSplashLoader`, `fixed inset-0 z-50`) durante
    // `DURACION_TRANSICION_VISTA_VIVA_MS` -- al cabo de ese tiempo
    // `handleVerEnVivo` navega a `/panel?empresaId=`, momento en el que este
    // componente (y la cortina con él) se desmonta, igual que
    // `LoginPage.tsx`.
    return (
      <div className="tema-empresarial">
        <WelcomeSplashLoader
          contexto={empresa.nombre}
          mensaje="Cargando visualización de empresa…"
          visible
          style={
            {
              "--marca-color-1": empresa.colorPrimario ?? CONFIGURACION_EMPRESA_DEFAULT.colorPrimario,
              "--marca-color-2":
                empresa.colorSecundario ?? CONFIGURACION_EMPRESA_DEFAULT.colorSecundario,
            } as CSSProperties
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="empresa-detalle-encabezado" className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {empresa.logoUrl ? (
            <img
              src={empresa.logoUrl}
              alt=""
              className="size-full object-contain"
            />
          ) : (
            <Building2 className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div>
          <h1 id="empresa-detalle-encabezado" className="text-lg font-semibold text-foreground">
            {empresa.nombre}
          </h1>
          <p className="text-sm text-muted-foreground">
            Vista de solo lectura simulada -- los listados de abajo filtran por esta empresa
            del lado del servidor.
          </p>
        </div>
      </section>

      <section aria-labelledby="empresa-detalle-accesos" className="grid gap-4 sm:grid-cols-2">
        <h2 id="empresa-detalle-accesos" className="sr-only">
          Accesos de esta empresa
        </h2>
        <Link to={`/empresas/${empresaId}/usuarios`} className="block">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Users className="size-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Usuarios</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Usuarios y membresías de esta empresa.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link to={`/empresas/${empresaId}/bridges`} className="block">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <Plug className="size-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-base">Bridges</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Integraciones configuradas para esta empresa.
              </p>
            </CardContent>
          </Card>
        </Link>
        {hasRole(["ADMINISTRADOR"]) ? (
          <button
            type="button"
            className="block text-left"
            onClick={() => setDialogAdminAbierto(true)}
          >
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <UserPlus className="size-5 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Nuevo administrador</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Dar de alta un administrador para esta empresa.
                </p>
              </CardContent>
            </Card>
          </button>
        ) : null}
        <button type="button" className="block text-left" onClick={handleVerEnVivo}>
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              {/* Tratamiento "hero" -- círculo rojo detrás del ícono, mismo
                  criterio de composición que el avatar de `WhatsAppChat` en
                  `LeadDetallePage.tsx` (`bg-primary text-primary-foreground
                  rounded-full`), pero en `destructive` para distinguir este
                  acceso como el que lleva a ver el panel en vivo. */}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                <Eye className="size-4" aria-hidden="true" />
              </span>
              <CardTitle className="text-base">Ver en vivo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Simular el panel de esta empresa con su marca real.
              </p>
            </CardContent>
          </Card>
        </button>
      </section>

      {dialogAdminAbierto ? (
        <CrearAdministradorEmpresaDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogAdminAbierto(false);
          }}
          enviando={crearAdministrador.isPending}
          onSubmit={(valores) =>
            crearAdministrador.mutate(valores, { onSuccess: () => setDialogAdminAbierto(false) })
          }
        />
      ) : null}
    </div>
  );
}
