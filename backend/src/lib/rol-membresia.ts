import type { Membresia, Prisma, RolUsuario } from "@prisma/client";

/**
 * Fuente única de verdad del mapeo `Membresia` <-> rol legado (`Usuario.rol`).
 * Extraída de `shadow-authorization.service.ts` (Bloque C, pre-existente) y
 * `notificacion.repository.ts` (Bloque C, D5) — ambos módulos reimplementaban
 * direcciones opuestas del mismo mapeo por separado. AGENTS.md §4 Backend: la
 * lógica de negocio vive en `services`, no en `repositories`; esta función es
 * pura (sin I/O) y vive en `lib` para que tanto `services` como
 * `repositories` puedan importarla sin invertir la dirección de dependencia
 * (`repositories` nunca debe importar de `services`).
 *
 * `ASESOR` legado -> `Membresia(rol: ASESOR, habilitadoParaVenta: false)`.
 * `VENDEDOR` legado -> `Membresia(rol: ASESOR, habilitadoParaVenta: true)`.
 * `ADMINISTRADOR`/`SUPERVISOR` legado -> mismo `rol`, sin equivalente de
 * `habilitadoParaVenta` (no existen como `VENDEDOR` en `Membresia`).
 */
export function rolEquivalente(membresia: Pick<Membresia, "rol" | "habilitadoParaVenta">): RolUsuario {
  if (membresia.rol === "ASESOR") {
    return membresia.habilitadoParaVenta ? "VENDEDOR" : "ASESOR";
  }
  return membresia.rol;
}

/**
 * Mapeo inverso EXACTO de `rolEquivalente` arriba: dado un conjunto de roles
 * legado solicitados, devuelve las condiciones `Membresia` (`Prisma.WhereInput`)
 * que los identifican. Usado por `notificacion.repository.ts::findActiveRecipientIds`
 * (Bloque C, D5) para resolver destinatarios por `Membresia` en vez de escanear
 * `Usuario.rol` directamente.
 */
export function condicionesMembresiaPorRol(roles: readonly RolUsuario[]): Prisma.MembresiaWhereInput[] {
  const condiciones: Prisma.MembresiaWhereInput[] = [];
  if (roles.includes("ADMINISTRADOR")) condiciones.push({ rol: "ADMINISTRADOR" });
  if (roles.includes("SUPERVISOR")) condiciones.push({ rol: "SUPERVISOR" });
  if (roles.includes("ASESOR")) condiciones.push({ rol: "ASESOR", habilitadoParaVenta: false });
  if (roles.includes("VENDEDOR")) condiciones.push({ rol: "ASESOR", habilitadoParaVenta: true });
  return condiciones;
}
