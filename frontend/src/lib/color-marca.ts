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

/**
 * `--background` (index.css línea 35) -- fondo neutro claro de toda la app,
 * capturado acá como constante fija (no hay tema oscuro todavía) para poder
 * evaluar contraste de texto de marca aplicado DIRECTO sobre el contenido
 * central, sin depender de CSS en tiempo de ejecución.
 */
const APP_BACKGROUND = "245 243 238";

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

/** Triplete RGB ("R G B") -> {h, s, l} (h en grados 0-360, s/l en 0-1). */
function rgbTripletToHsl(triplet: string): { h: number; s: number; l: number } {
  const [r0, g0, b0] = triplet.split(" ").map(Number);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  return { h, s, l };
}

/** {h, s (0-1), l en PORCENTAJE 0-100} -> triplete RGB ("R G B"). */
function hslToRgbTriplet(h: number, s: number, lPercent: number): string {
  const l = lPercent / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    [r1, g1, b1] = [c, x, 0];
  } else if (h < 120) {
    [r1, g1, b1] = [x, c, 0];
  } else if (h < 180) {
    [r1, g1, b1] = [0, c, x];
  } else if (h < 240) {
    [r1, g1, b1] = [0, x, c];
  } else if (h < 300) {
    [r1, g1, b1] = [x, 0, c];
  } else {
    [r1, g1, b1] = [c, 0, x];
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return `${r} ${g} ${b}`;
}

/**
 * Dado un triplete "fuente de tonalidad", genera las 2 variantes de la MISMA
 * tonalidad (H/S) que reemplazan al navy fijo (`VIMCORE_DARK`, retirado):
 * una empujada a oscuro (L 15%) y otra empujada a claro (L 90%). La elección
 * entre estas dos MÁS blanco sigue siendo por contraste medido (nunca una
 * regla fija de "siempre oscurecer") -- ver `foregroundForContrast` y
 * `textoMarcaSobreFondoNeutro` más abajo, los dos únicos consumidores.
 */
function variantesDeTonalidad(hueSourceTriplet: string): { oscura: string; clara: string } {
  const { h, s } = rgbTripletToHsl(hueSourceTriplet);
  return {
    oscura: hslToRgbTriplet(h, s, 15),
    clara: hslToRgbTriplet(h, s, 90),
  };
}

/** De una lista de candidatos, el que dé mayor `contrastRatio` contra `referenceBackground`. */
function mejorContraste(referenceBackground: string, candidatos: string[]): string {
  return candidatos.reduce((mejor, candidato) =>
    contrastRatio(referenceBackground, candidato) > contrastRatio(referenceBackground, mejor)
      ? candidato
      : mejor,
  );
}

/**
 * Texto legible (WCAG AA, 4.5:1) sobre un fondo de acento arbitrario --
 * mismo umbral que ya usa la paleta base del proyecto (`index.css`,
 * "blanco sobre azul 5.2:1, todos AA"). El acento base (`--vimcore-accent`,
 * 37 99 235) cumple con blanco; un color de marca real por empresa (ej.
 * naranja/verde saturado sobre fondo claro) puede NO cumplirlo.
 *
 * Antes se elegía entre blanco y un navy FIJO (`VIMCORE_DARK`, remanente de
 * la identidad azul original) el que diera mayor contraste. Ahora se elige
 * entre blanco y DOS variantes de la MISMA tonalidad que el propio
 * `backgroundTriplet` recibido (esta función no conoce el hex de marca
 * original, solo el triplete RGB ya convertido -- el hue se deriva de ESE
 * triplete): una empujada a oscuro (L 15%) y otra empujada a claro (L 90%).
 * Sigue siendo la matemática de contraste la que decide sola, sin reglas
 * especiales por caso -- para un fondo ya oscuro blanco casi siempre gana
 * (blanco es el máximo de luminancia posible, ninguna variante clara con
 * saturación puede superarlo), y para un fondo claro/pastel la variante
 * oscura de su propia tonalidad reemplaza al navy fijo de antes.
 */
export function foregroundForContrast(backgroundTriplet: string): string {
  const { oscura, clara } = variantesDeTonalidad(backgroundTriplet);
  return mejorContraste(backgroundTriplet, [WHITE, oscura, clara]);
}

/**
 * Texto/íconos de marca aplicados DIRECTO sobre el fondo neutro de contenido
 * (`--background`, `APP_BACKGROUND` arriba) -- distinto de
 * `foregroundForContrast`: acá la tonalidad se deriva de un color de marca
 * (`colorSecundario`, el mismo campo que ya usan `--primary`/`--ring`), pero
 * el contraste se mide contra el fondo neutro de la app, NUNCA contra el
 * propio color de marca (ese es el caso de `--primary-foreground`, texto
 * encima de un chip ya pintado con `--primary`). Fuente del nuevo token
 * `--marca-texto-contenido` en `resolveEstilosMarca`.
 */
function textoMarcaSobreFondoNeutro(colorSecundarioTriplet: string): string {
  const { oscura, clara } = variantesDeTonalidad(colorSecundarioTriplet);
  return mejorContraste(APP_BACKGROUND, [WHITE, oscura, clara]);
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
    // Texto/íconos de marca DIRECTO sobre el fondo neutro de contenido (no
    // dentro de un chip ya coloreado) -- ver `textoMarcaSobreFondoNeutro`.
    // Consumo pendiente: migración de los 24 usos de `idec` (otra tarea).
    "--marca-texto-contenido": textoMarcaSobreFondoNeutro(acento),
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
