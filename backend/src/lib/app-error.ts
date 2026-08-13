/**
 * Error de dominio base. AGENTS.md §4: "clase AppError con código de dominio +
 * middleware central. Nunca devuelvas un stack trace al cliente."
 *
 * Esta clase fija la forma que usarán las capas `service`/`controller` de
 * cambios futuros para señalar errores de negocio. Este cambio (configuración
 * base del monorepo) no introduce códigos de dominio propios: `/salud` no
 * lanza `AppError` (su repositorio atrapa su propio error, D-A). Solo se
 * establece la infraestructura base.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusHttp: number;

  constructor(code: string, statusHttp: number, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusHttp = statusHttp;
  }
}
