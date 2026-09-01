import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import type { AdminUsuario } from "@/tipos/usuario";
import { BajaUsuarioDialog } from "../usuarios/BajaUsuarioDialog";
import { CrearUsuarioDialog } from "../usuarios/CrearUsuarioDialog";
import { EditarUsuarioDialog } from "../usuarios/EditarUsuarioDialog";
import { RestablecerPasswordDialog } from "../usuarios/RestablecerPasswordDialog";
import { UsuariosFiltros } from "../usuarios/UsuariosFiltros";
import { UsuariosTable } from "../usuarios/UsuariosTable";
import {
  FILTRO_TODOS,
  FILTROS_USUARIOS_VACIOS,
  buildUsuariosQueryParams,
  type UsuariosFiltrosState,
} from "../usuarios/usuarios.utils";
import {
  useCreateEmpresaAdministrador,
  useCreateUsuario,
  useDeactivateUsuario,
  useReactivateUsuario,
  useResetPassword,
  useUpdateUsuario,
  useUsuarios,
} from "../usuarios/useUsuarios";
import { useEmpresaHolding } from "./useEmpresaAparienciaHolding";

/** Mismo criterio de paginación que `usuarios/UsuariosPage.tsx::USUARIOS_POR_PAGINA`. */
const USUARIOS_POR_PAGINA = 10;

/**
 * Usuarios de UNA empresa puntual, vista dedicada de un holding-wide
 * (`empresas/:empresaId/usuarios`, ruta propia -- reemplaza el redirect
 * anterior a `/usuarios?empresaId=`, la MISMA pantalla que un holding-wide
 * usa para sus propias cuentas holding-wide). A diferencia de
 * `usuarios/UsuariosPage.tsx`:
 *
 * - `empresaId` sale de `useParams` (fijo por la ruta), NUNCA de
 *   `useVistaEmpresa` -- esta pantalla no depende del query param
 *   `?empresaId=` que usa esa otra ruta.
 * - El toggle "solo usuarios holding-wide (sin empresa)" de `UsuariosFiltros`
 *   se oculta (`mostrarFiltroHoldingWide={false}`): no tiene sentido ver
 *   "usuarios sin empresa" parado sobre la vista de UNA empresa concreta.
 * - El alta SIEMPRE manda `empresaId` en el body de `POST /usuarios` (acá
 *   siempre hay una empresa fija, a diferencia de `UsuariosPage.tsx`, donde
 *   es condicional a `useVistaEmpresa().empresaVistaId`) -- EXCEPTO cuando el
 *   rol elegido en `CrearUsuarioDialog` es `ADMINISTRADOR`: ese caso no pasa
 *   por `POST /usuarios` (`usuarios.service.ts::createUsuario` lo trata como
 *   holding-wide incondicional vía `ROLES_ACCESO_TOTAL` y descarta cualquier
 *   `empresaId` recibido), sino que se rutea a `useCreateEmpresaAdministrador`
 *   (`POST /empresas/:empresaId/administradores`, mismo mecanismo que
 *   `CrearAdministradorEmpresaDialog`), el único camino que hoy crea la
 *   `Membresia` con credencial propia -- ver
 *   `usuarios.service.ts::createEmpresaAdministrador`.
 *   `SUPERVISOR` tiene el mismo bug (cae holding-wide sin `Membresia`), pero
 *   no existe un equivalente `POST /empresas/:empresaId/supervisores` en el
 *   backend y no se agrega uno -- decisión explícita del usuario (2026-08-31):
 *   solo cambios de frontend, sin nuevas rutas de backend. `SUPERVISOR` sigue
 *   pasando por `POST /usuarios` a sabiendas de que queda holding-wide.
 * - Usa `useEmpresaHolding(empresaId)` (mismo hook que `EmpresaDetallePage.tsx`)
 *   solo para el nombre de la empresa en el título/breadcrumb -- mientras
 *   carga o si falla, la pantalla completa muestra ese estado en vez del
 *   listado (mismo patrón que `EmpresaDetallePage.tsx`).
 */
export function EmpresaUsuariosPage() {
  const { empresaId } = useParams<{ empresaId: string }>();
  const {
    data: empresa,
    isLoading: isLoadingEmpresa,
    isError: isErrorEmpresa,
    error: errorEmpresa,
    refetch: refetchEmpresa,
  } = useEmpresaHolding(empresaId);

  const [filtros, setFiltros] = useState<UsuariosFiltrosState>(FILTROS_USUARIOS_VACIOS);
  const [pagina, setPagina] = useState(1);

  const params = useMemo(
    () => buildUsuariosQueryParams(filtros, pagina, USUARIOS_POR_PAGINA, empresaId),
    [filtros, pagina, empresaId],
  );

  const { data, isLoading, isError, error, refetch } = useUsuarios(params);
  const crear = useCreateUsuario();
  // `empresaId` puede ser `undefined` acá (antes del guard `if (!empresaId)`
  // de abajo) -- los hooks no pueden llamarse condicionalmente, así que se
  // pasa `""` como fallback inerte: nunca se dispara una mutación real con
  // ese valor porque el guard corta el render antes de que el diálogo de
  // alta (único consumidor) pueda montarse.
  const crearAdmin = useCreateEmpresaAdministrador(empresaId ?? "");
  const actualizar = useUpdateUsuario();
  const restablecer = useResetPassword();
  const darDeBaja = useDeactivateUsuario();
  const reactivar = useReactivateUsuario();

  const [dialogAltaAbierto, setDialogAltaAbierto] = useState(false);
  const [usuarioEnEdicion, setUsuarioEnEdicion] = useState<AdminUsuario | null>(null);
  const [usuarioParaPassword, setUsuarioParaPassword] = useState<AdminUsuario | null>(null);
  const [usuarioParaBaja, setUsuarioParaBaja] = useState<AdminUsuario | null>(null);

  usePageHeader(
    empresa
      ? {
          title: `Usuarios de ${empresa.nombre}`,
          backTo: { label: empresa.nombre, href: `/empresas/${empresaId}` },
        }
      : null,
  );

  function updateFiltros(nuevos: UsuariosFiltrosState) {
    setFiltros(nuevos);
    setPagina(1);
  }

  const hayFiltrosActivos =
    filtros.busqueda !== "" || filtros.rol !== FILTRO_TODOS || filtros.estado !== FILTROS_USUARIOS_VACIOS.estado;

  if (!empresaId) {
    return <ErrorState message="Falta el identificador de la empresa en la URL." />;
  }

  if (isLoadingEmpresa) {
    return <LoadingState rows={4} rowHeight="h-16" />;
  }

  if (isErrorEmpresa) {
    return <ErrorState message={getErrorMessage(errorEmpresa)} onRetry={() => void refetchEmpresa()} />;
  }

  if (!empresa) {
    // Defensivo, mismo criterio que `EmpresaDetallePage.tsx`: un 404 real ya
    // cae en la rama `isErrorEmpresa` de arriba.
    return <ErrorState message="No se encontró la empresa solicitada." />;
  }

  const usuarios = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / USUARIOS_POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * USUARIOS_POR_PAGINA + 1;
  const hasta = Math.min(pagina * USUARIOS_POR_PAGINA, total);

  return (
    <div className="flex flex-col gap-4">
      <UsuariosFiltros
        filtros={filtros}
        onChange={updateFiltros}
        onNuevo={() => setDialogAltaAbierto(true)}
        mostrarFiltroHoldingWide={false}
      />

      {isLoading ? (
        <LoadingState rows={USUARIOS_POR_PAGINA} rowHeight="h-12" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : usuarios.length === 0 ? (
        <EmptyState
          title={
            hayFiltrosActivos
              ? "No hay usuarios que coincidan con estos filtros"
              : "Todavía no hay usuarios registrados en esta empresa"
          }
          description={
            hayFiltrosActivos
              ? "Prueba ajustar o limpiar los filtros aplicados."
              : "Crea el primero con el botón «Nuevo usuario»."
          }
        />
      ) : (
        <div className="flex flex-col">
          <UsuariosTable
            usuarios={usuarios}
            onEditar={setUsuarioEnEdicion}
            onRestablecerPassword={setUsuarioParaPassword}
            onDarDeBaja={setUsuarioParaBaja}
            onReactivar={(usuarioId) => reactivar.mutate(usuarioId)}
            reactivandoId={reactivar.isPending ? (reactivar.variables ?? null) : null}
            atenuarInactivos={filtros.estado !== "ACTIVOS"}
          />

          <div className="leads-table-footer flex h-10 shrink-0 items-center justify-between rounded-b-lg border-t border-sidebar-border bg-sidebar px-3 text-sm text-sidebar-foreground">
            <span>
              Mostrando {desde}–{hasta} de {total} usuarios
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina <= 1} onClick={() => setPagina(1)} aria-label="Primera página" title="Primera página">
                <ChevronsLeft aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Página anterior" title="Página anterior">
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span>
                Página {pagina} de {totalPaginas}
              </span>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Página siguiente" title="Página siguiente">
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-sidebar-foreground hover:bg-transparent" disabled={pagina >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última página" title="Última página">
                <ChevronsRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {dialogAltaAbierto ? (
        <CrearUsuarioDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setDialogAltaAbierto(false);
          }}
          enviando={crear.isPending || crearAdmin.isPending}
          onSubmit={(valores) => {
            // Rol ADMINISTRADOR: no pasa por `POST /usuarios` -- ver el
            // docblock de este componente más arriba. SUPERVISOR sí, a
            // sabiendas del bug pendiente (sin ruta de backend equivalente).
            if (valores.rol === "ADMINISTRADOR") {
              crearAdmin.mutate(
                { nombre: valores.nombre, correo: valores.correo, password: valores.password },
                { onSuccess: () => setDialogAltaAbierto(false) },
              );
              return;
            }
            crear.mutate(
              { ...valores, empresaId },
              { onSuccess: () => setDialogAltaAbierto(false) },
            );
          }}
        />
      ) : null}

      {usuarioEnEdicion ? (
        <EditarUsuarioDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setUsuarioEnEdicion(null);
          }}
          usuario={usuarioEnEdicion}
          enviando={actualizar.isPending}
          onSubmit={(valores) =>
            actualizar.mutate(
              { id: usuarioEnEdicion.id, input: valores },
              { onSuccess: () => setUsuarioEnEdicion(null) },
            )
          }
        />
      ) : null}

      {usuarioParaPassword ? (
        <RestablecerPasswordDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setUsuarioParaPassword(null);
          }}
          usuario={usuarioParaPassword}
          enviando={restablecer.isPending}
          onSubmit={(password) =>
            restablecer.mutate(
              { id: usuarioParaPassword.id, password },
              { onSuccess: () => setUsuarioParaPassword(null) },
            )
          }
        />
      ) : null}

      {usuarioParaBaja ? (
        <BajaUsuarioDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setUsuarioParaBaja(null);
          }}
          usuario={usuarioParaBaja}
          confirmando={darDeBaja.isPending}
          onConfirm={() =>
            darDeBaja.mutate(usuarioParaBaja.id, { onSuccess: () => setUsuarioParaBaja(null) })
          }
        />
      ) : null}
    </div>
  );
}
