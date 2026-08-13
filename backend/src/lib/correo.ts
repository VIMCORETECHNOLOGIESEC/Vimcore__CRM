/**
 * §1.2 (docs/02-reglas-negocio.md): `normalizado` es trim + minúsculas,
 * exclusivamente para comparar. `original` se conserva sin alterar para
 * envío. Sin validación de formato: §8 (docs/05-bridges.md) prohíbe
 * descartar un lead pagado por un correo mal escrito.
 */
export interface CorreoNormalizado {
  original: string;
  normalizado: string;
}

export function normalizeCorreo(
  raw: string | null | undefined,
): CorreoNormalizado | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const normalizado = raw.trim().toLowerCase();

  if (normalizado.length === 0) {
    return null;
  }

  return { original: raw, normalizado };
}
