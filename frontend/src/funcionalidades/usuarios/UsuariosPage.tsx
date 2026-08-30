import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useMemo, useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import type { AdminUsuario } from "@/tipos/usuario";
import { BajaUsuarioDialog } from "./BajaUsuarioDialog";
import { CrearUsuarioDialog } from "./CrearUsuarioDialog";
import { EditarUsuarioDialog } from "./EditarUsuarioDialog";
import { RestablecerPasswordDialog } from "./RestablecerPasswordDialog";
import { UsuariosFiltros } from "./UsuariosFiltros";
import { UsuariosTable } from "./UsuariosTable";
import {
  FILTRO_TODOS,
  FILTROS_USUARIOS_VACIOS,
  buildUsuariosQueryParams,
  type UsuariosFiltrosState,
} from "./usuarios.utils";
import {
  useCreateUsuario,
  useDeactivateUsuario,
  useReactivateUsuario,
  useResetPassword,
  useUpdateUsuario,
  useUsuarios,
} from "./useUsuarios";

/**
 * Sin selector de tamaño de página todavía, mismo criterio que
 * `leads/LeadsPage.tsx::LEADS_POR_PAGINA`.
 */
const USUARIOS_POR_PAGINA = 10;

/**
 * Administración de usuarios (F7, docs/07 -- solo administrador, ruta
 * protegida en `router.tsx`). Backend real para listado/alta/edición/
 * restablecimiento de contraseña/baja lógica/reactivación (`usuarios.api.ts`),
 * con filtro (búsqueda, rol, estado -- default "Activos") y paginación reales
 * desde el backend. La reasignación de la cartera activa al dar de baja un
 * usuario también es backend real (M2, atómica) -- el frontend solo confirma
 * la baja, ver `BajaUsuarioDialog`. Reactivar, en cambio, no pide
 * confirmación (mismo criterio que `bridges/BridgesPage.tsx`): arranca con
 * cartera vacía, sin restaurar nada, acción reversible de un clic. La
 * columna "carga activa de leads" es de solo lectura -- ver el comentario de
 * brecha en `usuarios.api.ts`.
 */
export function UsuariosPage() {
  usePageHeader({ title: "Usuarios" });

  const [filtros, setFiltros] = useState<UsuariosFiltrosState>(FILTROS_USUARIOS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const { empresaVistaId } = useVistaEmpresa();

  const params = useMemo(
    () => buildUsuariosQueryParams(filtros, pagina, USUARIOS_POR_PAGINA, empresaVistaId ?? undefined),
    [filtros, pagina, empresaVistaId],
  );

  const { data, isLoading, isError, error, refetch } = useUsuarios(params);
  const crear = useCreateUsuario();
  const actualizar = useUpdateUsuario();
  const restablecer = useResetPassword();
  const darDeBaja = useDeactivateUsuario();
  const reactivar = useReactivateUsuario();

  const [dialogAltaAbierto, setDialogAltaAbierto] = useState(false);
  const [usuarioEnEdicion, setUsuarioEnEdicion] = useState<AdminUsuario | null>(null);
  const [usuarioParaPassword, setUsuarioParaPassword] = useState<AdminUsuario | null>(null);
  const [usuarioParaBaja, setUsuarioParaBaja] = useState<AdminUsuario | null>(null);

  function updateFiltros(nuevos: UsuariosFiltrosState) {
    setFiltros(nuevos);
    setPagina(1);
  }

  const hayFiltrosActivos =
    filtros.busqueda !== "" ||
    filtros.rol !== FILTRO_TODOS ||
    filtros.estado !== FILTROS_USUARIOS_VACIOS.estado ||
    filtros.soloHoldingWide;

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
              : "Todavía no hay usuarios registrados"
          }
          description={
            hayFiltrosActivos
              ? "Probá ajustar o limpiar los filtros aplicados."
              : "Creá el primero con el botón «Nuevo usuario»."
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
          enviando={crear.isPending}
          onSubmit={(valores) =>
            crear.mutate(valores, { onSuccess: () => setDialogAltaAbierto(false) })
          }
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
