import { hash, verify } from "@node-rs/argon2";

/**
 * AGENTS.md §6: contraseñas con `argon2id`, nunca bcrypt con configuración
 * por defecto. `@node-rs/argon2` usa argon2id por defecto y no requiere
 * toolchain de compilación (binarios napi-rs precompilados por plataforma —
 * ver verificación de supuestos en el diseño).
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}
