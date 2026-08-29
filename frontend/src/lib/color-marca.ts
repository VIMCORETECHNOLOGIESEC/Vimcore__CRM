import type { ConfiguracionEmpresa } from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";
import { CONFIGURACION_EMPRESA_DEFAULT } from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";
import type { AuthenticatedUser } from "@/tipos/usuario";

/**
 * tema-empresarial-integracion (Parte 3, acentos del shell autenticado):
 * las variables shadcn (`--primary`, `--sidebar-*`, `--ring`, ver
 * `index.css`) se definen como triplete RGB espaciado ("37 99 235") para
 * poder componerlas con `rgb(var(--x) / <alpha>)`, no como hex. El color de
 * marca por empresa (`Empresa.colorPrimario/colorSecundario`,
 * `GET /auth/perfil`) llega en hex -- este archivo hace el puente.
 */

/** "#7c2d12" (o "7c2d12", con o sin mayúsculas) -> "124 45 18". */
export function hexToRgbTriplet(hex: string): string {
  const limpio = hex.replace("#", "");
  const r = Number.parseInt(limpio.slice(0, 2), 16);
  const g = Number.parseInt(limpio.slice(2, 4), 16);
  const b = Number.parseInt(limpio.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const WHITE = "255 255 255";
/** `--vimcore` (index.css) -- mismo azul marino oscuro que ya usa el tema
 * base como alternativa oscura, para no introducir un tercer color de texto
 * fijo además de blanco. */
const VIMCORE_DARK = "30 42 94";

/** Matemática genérica de contraste WCAG (sin vocabulario de dominio) --
 * inglés puro, AGENTS.md §3.4. */
function linearChannel(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(triplet: string): number {
  const [r, g, b] = triplet.split(" ").map(Number);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

function contrastRatio(tripletA: string, tripletB: string): number {
  const lA = relativeLuminance(tripletA);
  const lB = relativeLuminance(tripletB);
  const [lighter, darker] = lA >= lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Texto legible (WCAG AA, 4.5:1) sobre un fondo de acento arbitrario --
 * mismo umbral que ya usa la paleta base del proyecto (`index.css`,
 * "blanco sobre azul 5.2:1, todos AA"). El acento base (`--vimcore-accent`,
 * 37 99 235) cumple con blanco; un color de marca real por empresa (ej.
 * naranja/verde saturado sobre fondo claro) puede NO cumplirlo -- en vez de
 * bloquear el color o documentarlo como límite conocido, se elige entre
 * blanco y el oscuro del tema base (`--vimcore`) el que dé mayor contraste,
 * para que el texto sea legible sin importar qué color cargue cada empresa.
 */

export function foregroundForContrast(backgroundTriplet: string): string {
  const contrastWithWhite = contrastRatio(backgroundTriplet, WHITE);
  const contrastWithDark = contrastRatio(backgroundTriplet, VIMCORE_DARK);
  return contrastWithWhite >= contrastWithDark ? WHITE : VIMCORE_DARK;
}

/**
 * Overrides de acento para el shell autenticado (`AppLayout.tsx`) -- decisión
 * del usuario, alcance acotado: SOLO acentos interactivos
 * (`--primary`/`--ring`/`--sidebar-primary`/`--sidebar-accent`), nunca
 * fondos ni texto de contenido. Se descartó recolorear toda la paleta
 * (riesgo de contraste en fondos/texto) y un simple badge sin tocar
 * componentes (cambio insuficiente).
 *
 * `--sidebar` (el fondo sólido del panel, hoy `var(--vimcore)`) queda
 * DELIBERADAMENTE fuera de esta lista -- no es solo la lectura de que el
 * pedido nombró los 4 tokens de arriba y no ese: `--sidebar` también se usa
 * como acento decorativo en contenido (`index.css`,
 * `box-shadow: inset 3px 0 0 0 rgb(var(--sidebar))` en filas destacadas de
 * tablas), así que tocarlo filtraría el color de marca a áreas de contenido
 * que la decisión del usuario excluye explícitamente. Si en vivo se ve
 * insuficiente, es un cambio de una línea agregar `--sidebar` acá -- no un
 * rediseño.
 *
 * Usa `colorSecundario` (el tono más vívido de los dos, ej. `#f97316` sobre
 * el `colorPrimario` `#7c2d12` de Empresa A) para los 4 tokens de acento,
 * replicando el patrón YA existente en la paleta base: `--vimcore` (fondo
 * oscuro) / `--vimcore-accent` (acento vívido) son dos tonos distintos, y
 * los 4 tokens de acento de hoy apuntan todos a `--vimcore-accent`, nunca a
 * `--vimcore`. El `-foreground` de cada uno se recalcula con
 * `foregroundForContrast` en vez de quedar fijo en blanco -- verificado
 * que los colores del seed de demostración (naranja/verde) NO cumplen AA
 * 4.5:1 con blanco fijo.
 *
 * Jerarquía de 3 niveles (tema-empresarial-integracion, cierre del gap de
 * nivel intermedio): 1) color propio de la `Empresa` de la sesión `company`
 * (ambos campos seteados) -- sin cambios respecto a la versión anterior de
 * esta función; 2) si no, el color EN VIVO de `configuracion-empresa`
 * (holding, `useConfiguracionEmpresa()` en `AppLayout.tsx`, segundo
 * parámetro acá) -- cubre tanto sesión `holding` como una `Empresa` sin
 * color propio; 3) si esa config de holding todavía no llegó (carga o
 * error de la query), `CONFIGURACION_EMPRESA_DEFAULT` -- mismo criterio de
 * resiliencia que `LoginPage.tsx::obtenerConfiguracionEmpresaConFallback`,
 * el shell autenticado nunca debe demorar ni romperse por esto. Con esta
 * jerarquía SIEMPRE hay un color activo -- la función ya no devuelve
 * `undefined` salvo que `usuario` sea `null` (sesión sin resolver todavía).
 */
export function estilosDeMarcaPorEmpresa(
  usuario: AuthenticatedUser | null,
  configuracionHolding: Pick<ConfiguracionEmpresa, "colorPrimario" | "colorSecundario"> | undefined,
): Record<string, string> | undefined {
  if (!usuario) {
    return undefined;
  }

  const tieneColorPropio =
    usuario.sessionScope === "company" &&
    usuario.empresaColorPrimario !== null &&
    usuario.empresaColorSecundario !== null;

  const colorSecundario = tieneColorPropio
    ? (usuario.empresaColorSecundario as string)
    : (configuracionHolding?.colorSecundario ?? CONFIGURACION_EMPRESA_DEFAULT.colorSecundario);

  const acento = hexToRgbTriplet(colorSecundario);
  const acentoForeground = foregroundForContrast(acento);

  return {
    "--primary": acento,
    "--primary-foreground": acentoForeground,
    "--ring": acento,
    "--sidebar-primary": acento,
    "--sidebar-primary-foreground": acentoForeground,
    "--sidebar-accent": acento,
    "--sidebar-accent-foreground": acentoForeground,
  };
}
