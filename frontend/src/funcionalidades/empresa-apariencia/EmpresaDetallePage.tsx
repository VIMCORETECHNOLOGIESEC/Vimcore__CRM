import { Building2, Plug, Users } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { useEmpresasHolding } from "./useEmpresaAparienciaHolding";
import { useVistaEmpresa } from "./useVistaEmpresa";

/**
 * Máximo de una sola página para poder resolver una `Empresa` puntual por
 * id en el cliente -- no existe todavía un `GET /empresas/:id` (gap de
 * backend, fuera de lo pedido a Mateo hasta ahora, ver
 * `docs/23-alcance-funcional-manual-tecnico.md`). Mientras tanto se
 * reutiliza el listado paginado (`GET /empresas`) con un `pageSize` grande
 * y se busca el id en memoria -- funciona para la escala real confirmada
 * por el usuario (478 empresas), no escalaría a un holding con miles.
 */
const EMPRESAS_PAGE_SIZE_DETALLE = 500;

/**
 * Detalle de empresa para un holding-wide (pantallas de gestión jerárquica
 * holding/empresa, reparto de trabajo con `crm-comercial-28`). Vista de
 * SOLO LECTURA simulada -- no cambia la sesión real, solo setea
 * `?empresaId=` vía `useVistaEmpresa` para que `UsuariosPage`/`BridgesPage`
 * (reusadas tal cual, sin duplicar UI) filtren su fetch por esta empresa.
 * El backend todavía no filtra por `empresaId` (gap ya reportado a Mateo,
 * prioridad 1) -- hasta que lo haga, estos links muestran el listado
 * completo sin filtrar, no roto, solo sin scope real todavía.
 *
 * Mismo patrón estructural que `BridgeDetallePage.tsx`: `useParams` + hook
 * de listado filtrado en memoria + `usePageHeader({title, backTo})`.
 */
export function EmpresaDetallePage() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const { entrarAEmpresa, salirDeEmpresa } = useVistaEmpresa();
  const { data, isLoading, isError, error, refetch } = useEmpresasHolding({
    pageSize: EMPRESAS_PAGE_SIZE_DETALLE,
  });

  const empresa = data?.items.find((item) => item.id === empresaId);

  useEffect(() => {
    if (!empresaId) return;
    entrarAEmpresa(empresaId);
    return () => salirDeEmpresa();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrar/salir son estables (useCallback), reintroducirlas dispara el effect en cada render.
  }, [empresaId]);

  usePageHeader(
    empresa ? { title: empresa.nombre, backTo: { label: "Empresas", href: "/empresas" } } : null,
  );

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
    return <ErrorState message="No se encontró la empresa solicitada." />;
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
            Vista de solo lectura simulada -- los listados de abajo todavía no filtran de
            verdad por empresa del lado del servidor.
          </p>
        </div>
      </section>

      <section aria-labelledby="empresa-detalle-accesos" className="grid gap-4 sm:grid-cols-2">
        <h2 id="empresa-detalle-accesos" className="sr-only">
          Accesos de esta empresa
        </h2>
        <Link to={`/usuarios?empresaId=${empresaId}`} className="block">
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
        <Link to={`/bridges?empresaId=${empresaId}`} className="block">
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
      </section>
    </div>
  );
}
