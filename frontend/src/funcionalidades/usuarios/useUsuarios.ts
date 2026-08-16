import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createUsuarioApi,
  deactivateUsuarioApi,
  fetchUsuariosApi,
  reassignCarteraActiva,
  resetPasswordApi,
  updateUsuarioApi,
  type UpdateUsuarioInput,
  type CreateUsuarioInput,
  type UsuariosQueryParams,
} from "./usuarios.api";

const USUARIOS_QUERY_KEY = "usuarios";

/**
 * Listado de usuarios paginado y filtrado (F7). Backend real -- ver
 * `usuarios.api.ts`. `keepPreviousData` evita el parpadeo a "cargando" al
 * cambiar de página o filtro, mismo criterio que `leads/useLeads.ts::useLeads`.
 */
export function useUsuarios(params: UsuariosQueryParams) {
  return useQuery({
    queryKey: [USUARIOS_QUERY_KEY, params],
    queryFn: () => fetchUsuariosApi(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * Alta de usuario. El mensaje de error accionable ante un correo duplicado
 * (`409 correo_en_uso`, `usuarios.service.ts::emailAlreadyInUse`) u otro
 * fallo lo muestra el manejo global de errores de mutaciones
 * (`api/queryClient.ts`), no un `onError` local -- mismo criterio que
 * `useAssignLeadsMasivo` en F3.
 */
export function useCreateUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUsuarioInput) => createUsuarioApi(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [USUARIOS_QUERY_KEY] });
      toast.success("Usuario creado correctamente.");
    },
  });
}

/** Edición de nombre/correo/rol (sin contraseña -- ver `useResetPassword`). */
export function useUpdateUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUsuarioInput }) =>
      updateUsuarioApi(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [USUARIOS_QUERY_KEY] });
      toast.success("Usuario actualizado correctamente.");
    },
  });
}

/** Restablecimiento de contraseña por un administrador (F7). */
export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      resetPasswordApi(id, password),
    onSuccess: () => {
      toast.success("Contraseña restablecida correctamente.");
    },
  });
}

/**
 * Baja lógica con reasignación obligatoria de la cartera activa (F7). Si se
 * pasa `nuevoResponsableId`, reasigna primero (mock, ver `usuarios.api.ts`) y
 * recién después llama al backend real de baja -- si la reasignación falla,
 * nunca se llega a desactivar al usuario.
 */
export function useDeactivateUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      nuevoResponsableId,
    }: {
      id: string;
      nuevoResponsableId?: string;
    }) => {
      if (nuevoResponsableId) {
        await reassignCarteraActiva(id, nuevoResponsableId);
      }
      await deactivateUsuarioApi(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [USUARIOS_QUERY_KEY] });
      toast.success("Usuario dado de baja correctamente.");
    },
  });
}
