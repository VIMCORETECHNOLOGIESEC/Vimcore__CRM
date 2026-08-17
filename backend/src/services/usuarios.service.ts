import type { RolUsuario } from "@prisma/client";
import { AppError } from "../lib/app-error.js";
import { hashPassword } from "../lib/password.js";
import * as usuarioRepository from "../repositories/usuario.repository.js";
import type {
  AdminUserView,
  ResponsableView,
  UpdateUserData,
} from "../repositories/usuario.repository.js";

function userNotFound(): AppError {
  return new AppError("usuario_no_encontrado", 404, "Usuario no encontrado");
}

function emailAlreadyInUse(): AppError {
  return new AppError("correo_en_uso", 409, "El correo ya está en uso");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export interface CreateUserInput {
  nombre: string;
  correo: string;
  password: string;
  rol: RolUsuario;
}

export interface UpdateUserInput {
  nombre?: string;
  correo?: string;
  password?: string;
  rol?: RolUsuario;
}

/** Alta de usuario (D9: solo `ADMINISTRADOR` llega hasta acá vía `requireRole`). */
export async function createUser(input: CreateUserInput): Promise<AdminUserView> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await usuarioRepository.createUser({
      nombre: input.nombre,
      correo: input.correo,
      passwordHash,
      rol: input.rol,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw emailAlreadyInUse();
    }
    throw error;
  }
}

export async function findAllUsers(): Promise<AdminUserView[]> {
  return usuarioRepository.findAllUsers();
}

export async function findUserById(id: string): Promise<AdminUserView> {
  const user = await usuarioRepository.findPublicById(id);
  if (!user) {
    throw userNotFound();
  }
  return user;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AdminUserView> {
  const data: UpdateUserData = {
    nombre: input.nombre,
    correo: input.correo,
    rol: input.rol,
  };
  if (input.password) {
    data.passwordHash = await hashPassword(input.password);
  }

  try {
    const updated = await usuarioRepository.updateUser(id, data);
    if (!updated) {
      throw userNotFound();
    }
    return updated;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw emailAlreadyInUse();
    }
    throw error;
  }
}

/**
 * F3/F4 (diseño D-A1): catálogo de responsables activos para un pool de rol
 * — consumido por `GET /usuarios/responsables` y (indirectamente, vía el
 * frontend) por el selector de destinatario del lote de asignación.
 */
export async function findResponsables(rol: RolUsuario): Promise<ResponsableView[]> {
  return usuarioRepository.findResponsablesActivosPorRol(rol);
}

/** D3: baja lógica — ver `usuario.repository.deactivateUser` para la transacción. */
export async function deactivateUser(id: string): Promise<void> {
  const deactivated = await usuarioRepository.deactivateUser(id);
  if (!deactivated) {
    throw userNotFound();
  }
}
