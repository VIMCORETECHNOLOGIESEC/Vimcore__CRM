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

export function contrastRatio(tripletA: string, tripletB: string): number {
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
 * del usuario, alcance acotado: acentos interactivos
 * (`--primary`/`--ring`/`--sidebar-primary`/`--sidebar-accent`) MÁS la
 * superficie del panel lateral (`--sidebar` y sus 3 tokens companion), nunca
 * fondos ni texto del contenido central. Se descartó recolorear toda la
 * paleta (riesgo de contraste en fondos/texto) y un simple badge sin tocar
 * componentes (cambio insuficiente).
 *
 * `--sidebar` (personalizacion-identidad-visual, revisión de la decisión
 * previa): esta función ahora SÍ deriva `--sidebar`,
 * `--sidebar-foreground`, `--sidebar-border` y `--sidebar-ring` desde
 * `colorPrimario` -- decisión consciente que reemplaza la exclusión
 * anterior (`--sidebar` fijo en `var(--vimcore)` para toda empresa). El
 * mismo token también pinta el acento decorativo de filas destacadas en
 * tablas (`index.css`, antes `box-shadow: inset 3px 0 0 0 rgb(var(--sidebar))`
 * en `.leads-table-row`) -- ese acento de contenido se repuntó a `--primary`
 * (derivado de `colorSecundario`) precisamente para mantener `--sidebar`
 * fuera del contenido central y dejarlo exclusivo del panel lateral y los
 * encabezados de tabla (`bg-sidebar`/`text-sidebar-foreground`).
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
export function resolveEstilosMarca(
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

  const colorPrimario = tieneColorPropio
    ? (usuario.empresaColorPrimario as string)
    : (configuracionHolding?.colorPrimario ?? CONFIGURACION_EMPRESA_DEFAULT.colorPrimario);
  const colorSecundario = tieneColorPropio
    ? (usuario.empresaColorSecundario as string)
    : (configuracionHolding?.colorSecundario ?? CONFIGURACION_EMPRESA_DEFAULT.colorSecundario);

  const acento = hexToRgbTriplet(colorSecundario);
  const acentoForeground = foregroundForContrast(acento);

  const sidebar = hexToRgbTriplet(colorPrimario);
  const sidebarForeground = foregroundForContrast(sidebar);

  return {
    "--primary": acento,
    "--primary-foreground": acentoForeground,
    "--ring": acento,
    "--sidebar-primary": acento,
    "--sidebar-primary-foreground": acentoForeground,
    "--sidebar-accent": acento,
    "--sidebar-accent-foreground": acentoForeground,
    "--sidebar": sidebar,
    "--sidebar-foreground": sidebarForeground,
    "--sidebar-border": sidebarForeground,
    "--sidebar-ring": sidebarForeground,
  };
}

/**
 * PASO 6 (tema-empresarial-integracion): isotipo de marca -- MISMA jerarquía
 * de 3 niveles que `resolveEstilosMarca` de arriba, pero el logo no es
 * una variable CSS de color: se devuelve aparte, como una URL (o `null`).
 * 1) isotipo propio de la `Empresa` de una sesión `company`
 *    (`usuario.empresaLogoUrl`); 2) si no, el del holding EN VIVO
 *    (`configuracionHolding.logoUrl`, `useConfiguracionEmpresa()`); 3) si
 *    ninguno de los dos existe todavía, `null` -- a propósito NUNCA un ícono
 *    genérico de reemplazo (decisión explícita del PASO 6): es mejor no
 *    mostrar nada que mostrar un isotipo roto o inventado.
 */
export function resolveLogoMarca(
  usuario: AuthenticatedUser | null,
  configuracionHolding: Pick<ConfiguracionEmpresa, "logoUrl"> | undefined,
): string | null {
  if (!usuario) {
    return null;
  }

  if (usuario.sessionScope === "company" && usuario.empresaLogoUrl !== null) {
    return usuario.empresaLogoUrl;
  }

  return configuracionHolding?.logoUrl ?? null;
}

/**
 * PASO 7 (tema-empresarial-integracion): nombre visible en el shell
 * autenticado (`app-sidebar.tsx`) -- misma jerarquía de 3 niveles que el
 * resto de este archivo: 1) nombre de la `Empresa` propia de una sesión
 * `company`; 2) si no, el del holding EN VIVO; 3) si ninguno de los dos
 * llegó todavía (carga/error de la query, o sesión `holding` sin config
 * cargada), `CONFIGURACION_EMPRESA_DEFAULT.nombre` -- SIEMPRE hay un nombre
 * para mostrar, nunca una cadena vacía.
 */
export function resolveNombreMarca(
  usuario: AuthenticatedUser | null,
  configuracionHolding: Pick<ConfiguracionEmpresa, "nombre"> | undefined,
): string {
  if (usuario?.sessionScope === "company" && usuario.empresaNombre !== null) {
    return usuario.empresaNombre;
  }

  return configuracionHolding?.nombre ?? CONFIGURACION_EMPRESA_DEFAULT.nombre;
}

/**
 * Fix real (splash post-login duplicado, cada uno con un dato mal): fuente
 * de verdad única para las 3 variables que `WelcomeSplashLoader.tsx`/
 * `tema-empresarial.css` (`.welcome-splash`) consumen para pintar el splash
 * -- `nombre` (texto) + `--marca-color-1`/`--marca-color-2` (hex CRUDO, sin
 * la conversión a triplete RGB que sí usa `resolveEstilosMarca` para los
 * tokens shadcn del shell, que son un caso de uso distinto). Antes había dos
 * implementaciones paralelas y desincronizadas: `LoginPage.tsx` tenía su
 * propia `resolveColorMarca` local que nunca resolvía `nombre` (seguía
 * viniendo del holding global aunque el usuario fuera de una `Empresa` con
 * nombre propio), y `AppLayout.tsx` no seteaba estas variables en absoluto
 * (le pasaba al splash los tokens de `resolveEstilosMarca`, que
 * `WelcomeSplashLoader` no lee).
 *
 * Reusa `resolveNombreMarca` (ya correcta) para el nombre, y replica la
 * misma jerarquía de 3 niveles de `resolveEstilosMarca` para los colores
 * (Empresa propia con AMBOS colores seteados -> holding EN VIVO ->
 * `CONFIGURACION_EMPRESA_DEFAULT`) sin la conversión a RGB.
 */
export function resolveMarcaCompleta(
  usuario: AuthenticatedUser | null,
  configuracionHolding:
    | Pick<ConfiguracionEmpresa, "nombre" | "colorPrimario" | "colorSecundario">
    | undefined,
): { nombre: string; "--marca-color-1": string; "--marca-color-2": string } {
  const colorPrimario =
    usuario?.sessionScope === "company" &&
    usuario.empresaColorPrimario !== null &&
    usuario.empresaColorSecundario !== null
      ? usuario.empresaColorPrimario
      : (configuracionHolding?.colorPrimario ?? CONFIGURACION_EMPRESA_DEFAULT.colorPrimario);

  const colorSecundario =
    usuario?.sessionScope === "company" &&
    usuario.empresaColorPrimario !== null &&
    usuario.empresaColorSecundario !== null
      ? usuario.empresaColorSecundario
      : (configuracionHolding?.colorSecundario ?? CONFIGURACION_EMPRESA_DEFAULT.colorSecundario);

  return {
    nombre: resolveNombreMarca(usuario, configuracionHolding),
    "--marca-color-1": colorPrimario,
    "--marca-color-2": colorSecundario,
  };
}
