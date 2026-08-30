import type { RolUsuario } from "@/tipos/usuario";

/** Etiquetas en español de cada rol (docs/07 F7, mismo texto que `PerfilPage.tsx`). */
export const ROL_ETIQUETAS: Record<RolUsuario, string> = {
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
  ASESOR: "Asesor",
  VENDEDOR: "Vendedor",
};

/**
 * Roles seleccionables al crear o cambiar el rol de un usuario (decisión de
 * producto, docs/16 D5: "Vendedor" deja de ser un rol propio y pasa a un
 * atributo "habilitado para venta" sobre `Membresia` -- migración real
 * pendiente del lado del backend, ver `docs/blocks/d-routing-oportunidad.md`).
 * Se saca de acá primero para no seguir creando usuarios `VENDEDOR` nuevos,
 * sin esperar al cutover del backend. `ROLES_USUARIO`/`ROL_ETIQUETAS` NO se
 * tocan -- usuarios `VENDEDOR` ya existentes se siguen mostrando y editando
 * (nombre/correo) con normalidad, solo dejan de ofrecerse como opción nueva.
 */
export const ROLES_USUARIO_SELECCIONABLES = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "ASESOR",
] as const satisfies readonly RolUsuario[];
