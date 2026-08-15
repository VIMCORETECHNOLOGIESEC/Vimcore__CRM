import { Plus } from "lucide-react";
import { useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import type { AdminUsuario } from "@/tipos/usuario";
import { BajaUsuarioDialog } from "./BajaUsuarioDialog";
import { CrearUsuarioDialog } from "./CrearUsuarioDialog";
import { EditarUsuarioDialog } from "./EditarUsuarioDialog";
import { RestablecerPasswordDialog } from "./RestablecerPasswordDialog";
import { UsuariosTable } from "./UsuariosTable";
import {
  useCreateUsuario,
  useDeactivateUsuario,
  useResetPassword,
  useUpdateUsuario,
  useUsuarios,
} from "./useUsuarios";

const USUARIOS_POR_ESQUELETO = 5;

/**
 * Administración de usuarios (F7, docs/07 -- solo administrador, ruta
 * protegida en `router.tsx`). Backend real para listado/alta/edición/
 * restablecimiento de contraseña/baja lógica (`usuarios.api.ts`); la
 * columna "carga activa de leads" y la reasignación obligatoria de cartera
 * en la baja son mock -- ver el comentario de brecha ahí.
 */
export function UsuariosPage() {
  usePageHeader({ title: "Usuarios" });

  const { data, isLoading, isError, error, refetch } = useUsuarios();
  const crear = useCreateUsuario();
  const actualizar = useUpdateUsuario();
  const restablecer = useResetPassword();
  const darDeBaja = useDeactivateUsuario();

  const [dialogAltaAbierto, setDialogAltaAbierto] = useState(false);
  const [usuarioEnEdicion, setUsuarioEnEdicion] = useState<AdminUsuario | null>(null);
  const [usuarioParaPassword, setUsuarioParaPassword] = useState<AdminUsuario | null>(null);
  const [usuarioParaBaja, setUsuarioParaBaja] = useState<AdminUsuario | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialogAltaAbierto(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nuevo usuario
        </Button>
      </div>

      {isLoading ? (
        <LoadingState rows={USUARIOS_POR_ESQUELETO} rowHeight="h-12" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Todavía no hay usuarios registrados"
          description="Creá el primero con el botón «Nuevo usuario»."
        />
      ) : (
        <UsuariosTable
          usuarios={data}
          onEditar={setUsuarioEnEdicion}
          onRestablecerPassword={setUsuarioParaPassword}
          onDarDeBaja={setUsuarioParaBaja}
        />
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
          onConfirm={(nuevoResponsableId) =>
            darDeBaja.mutate(
              { id: usuarioParaBaja.id, nuevoResponsableId },
              { onSuccess: () => setUsuarioParaBaja(null) },
            )
          }
        />
      ) : null}
    </div>
  );
}
