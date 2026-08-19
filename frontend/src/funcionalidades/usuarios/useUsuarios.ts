import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createUsuarioApi,
  deactivateUsuarioApi,
  fetchUsuariosApi,
  getCargaActivaDeUsuario,
  resetPasswordApi,
  updateUsuarioApi,
  type UpdateUsuarioInput,
  type CreateUsuarioInput,
  type UsuariosQueryParams,
} from "./usuarios.api";

const USUARIOS_QUERY_KEY = "usuarios";
const CARGA_ACTIVA_QUERY_KEY = "usuario-carga-activa";

/**
 * Carga activa de leads de un usuario (F7, integración F3/F4). Backend real
 * -- ver `usuarios.api.ts::getCargaActivaDeUsuario`.
 */
export function useCargaActivaDeUsuario(usuarioId: string) {
  return useQuery({
    queryKey: [CARGA_ACTIVA_QUERY_KEY, usuarioId],
    queryFn: () => getCargaActivaDeUsuario(usuarioId),
  });
}

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
 * Baja lógica (F7). Una única llamada a `deactivateUsuarioApi` -- la
 * reasignación de la cartera activa, si corresponde, la hace el backend de
 * forma atómica dentro de la misma transacción (M2, ver el JSDoc de
 * `deactivateUsuarioApi` en `usuarios.api.ts`). El manejo global de errores
 * de mutaciones (`api/queryClient.ts`) muestra el mensaje accionable si el
 * backend rechaza la baja por falta de candidato de reasignación
 * (`409 baja_sin_candidato_reasignacion`).
 */
export function useDeactivateUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUsuarioApi(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [USUARIOS_QUERY_KEY] });
      toast.success("Usuario dado de baja correctamente.");
    },
  });
}
