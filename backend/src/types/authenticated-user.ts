import type { RolUsuario } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}
