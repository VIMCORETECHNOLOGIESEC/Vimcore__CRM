import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RolUsuario } from "@/tipos/usuario";
import {
  createUsuarioApi,
  deactivateUsuarioApi,
  fetchUsuariosApi,
  getCandidatosReasignacion,
  getCargaActivaDeUsuario,
  reassignCarteraActiva,
  resetPasswordApi,
  updateUsuarioApi,
  type ActualizarUsuarioInput,
  type CrearUsuarioInput,
} from "./usuarios.api";

const USUARIOS_QUERY_KEY = "usuarios";
const CARGA_ACTIVA_QUERY_KEY = "usuario-carga-activa";
const CANDIDATOS_REASIGNACION_QUERY_KEY = "candidatos-reasignacion";

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
 * Candidatos del mismo rol operativo para recibir la cartera de un usuario
 * dado de baja (F7). Backend real -- ver `usuarios.api.ts::getCandidatosReasignacion`.
 */
export function useCandidatosReasignacion(rol: RolUsuario, excluirUsuarioId: string) {
  return useQuery({
    queryKey: [CANDIDATOS_REASIGNACION_QUERY_KEY, rol, excluirUsuarioId],
    queryFn: () => getCandidatosReasignacion(rol, excluirUsuarioId),
  });
}

/** Listado de usuarios (F7). Backend real -- ver `usuarios.api.ts`. */
export function useUsuarios() {
  return useQuery({ queryKey: [USUARIOS_QUERY_KEY], queryFn: fetchUsuariosApi });
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
    mutationFn: (input: CrearUsuarioInput) => createUsuarioApi(input),
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
    mutationFn: ({ id, input }: { id: string; input: ActualizarUsuarioInput }) =>
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
