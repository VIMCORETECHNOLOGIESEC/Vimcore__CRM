/**
 * Tipos compartidos con el backend para el usuario autenticado.
 * `RolUsuario` refleja el enum Prisma `RolUsuario` (backend/prisma/schema.prisma).
 * Mantenerlos sincronizados manualmente: el frontend no comparte el cliente
 * de Prisma generado.
 */
export type RolUsuario = "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR";

/**
 * `as const satisfies` (no solo `readonly RolUsuario[]`) para que el tipo se
 * infiera como tupla literal -- necesario para reutilizarla directamente en
 * `z.enum(ROLES_USUARIO)` (F7, formularios de alta/edición de usuario) sin
 * duplicar la lista de roles en un segundo lugar.
 */
export const ROLES_USUARIO = [
  "ADMINISTRADOR",
  "SUPERVISOR",
  "ASESOR",
  "VENDEDOR",
] as const satisfies readonly RolUsuario[];

/**
 * Scope tenant de la sesión autenticada (Bloque D0,
 * `docs/blocks/d0-visualizacion-multitenant.md`, "Contrato frontend").
 * `"company"` = sesión atada a una `Membresia` de una `Empresa` concreta;
 * `"holding"` = sesión holding-wide (`Usuario.correo`, sin empresa atribuida).
 */
export type SessionScope = "company" | "holding";

/**
 * Forma de `PublicUser` en `backend/src/services/auth.service.ts` --
 * respuesta cruda de `POST /auth/login` (Bloque D0, "Decisión: POST
 * /auth/login no se amplía"). Deliberadamente SIN `sessionScope`/`empresaId`/
 * `empresaNombre`: ese endpoint no los agrega ni los agregará.
 */
export interface PublicUser {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
}

/**
 * Forma de `PerfilResponse` en `backend/src/controllers/auth.controller.ts`
 * (`GET /auth/perfil`) -- amplía `PublicUser` con el scope tenant que Bloque
 * C/D0 ya resuelven server-side. Fuente canónica del estado autenticado
 * (doc D0, "Secuencia obligatoria"): `AuthContext` nunca construye este tipo
 * a partir de la respuesta de login, solo a partir de este endpoint.
 *
 * `empresaId`/`sessionScope` llegan siempre; `empresaNombre` viaja solo desde
 * D0 (resuelto server-side desde `empresaId`, nunca aportado por el
 * cliente); `membresiaId` es opcional -- presente únicamente para sesiones
 * `company` (dual-login-routing, Bloque B).
 *
 * `empresaColorPrimario`/`empresaColorSecundario` (tema-empresarial-integracion,
 * Parte 2): color de marca REAL de la `Empresa`, resuelto server-side igual
 * que `empresaNombre` (`auth.service.ts::resolveEmpresaMarca`). `null` para
 * sesión `holding` o para una `Empresa` `company` sin color propio seteado
 * -- en ese caso el consumidor (`LoginPage.tsx`) hace el fallback a la
 * paleta global de `ConfiguracionEmpresa`, nunca este tipo.
 */
export interface AuthenticatedUser extends PublicUser {
  sessionScope: SessionScope;
  empresaId: string | null;
  empresaNombre: string | null;
  empresaColorPrimario: string | null;
  empresaColorSecundario: string | null;
  /**
   * PASO 6 (tema-empresarial-integracion): isotipo REAL de la `Empresa`,
   * resuelto server-side igual que `empresaNombre`/`empresaColorPrimario`
   * (`auth.service.ts::resolveEmpresaMarca`). `null` para sesión `holding` o
   * una `Empresa` `company` sin isotipo propio -- el consumidor
   * (`color-marca.ts::resolveLogoMarca`) hace el fallback al isotipo EN
   * VIVO del holding, nunca este tipo.
   */
  empresaLogoUrl: string | null;
  membresiaId?: string;
}

/**
 * Vista administrativa de un usuario (F7, `GET/POST/PATCH /usuarios`).
 * Forma de `AdminUsuarioView` en `backend/src/repositories/usuario.repository.ts`
 * (`adminUsuarioSelect`) -- nunca incluye `passwordHash`. `creadoEn`/`actualizadoEn`
 * llegan como ISO 8601 (`Date` de Prisma serializado por `res.json`), igual
 * criterio que `Lead.ingresadoEn`.
 */
export interface AdminUsuario {
  id: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}
