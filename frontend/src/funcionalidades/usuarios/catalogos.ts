import type { RolUsuario } from "@/tipos/usuario";

/** Etiquetas en español de cada rol (docs/07 F7, mismo texto que `PerfilPage.tsx`). */
export const ROL_ETIQUETAS: Record<RolUsuario, string> = {
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  ASESOR: "Asesor",
  VENDEDOR: "Vendedor",
};
