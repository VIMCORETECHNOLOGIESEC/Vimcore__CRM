import { foregroundForContrast, hexToRgbTriplet } from "./color-marca";

/**
 * Pestaña dinámica: color de marca en `<meta name="theme-color">` +
 * favicon en `<link rel="icon">` (docs/09, decisión aprobada -- ver
 * `AppLayout.tsx`, mismo `useEffect` donde ya se resuelve `estilosMarca`).
 *
 * Reusa `hexToRgbTriplet`/`foregroundForContrast` de `color-marca.ts` tal
 * cual (sin tocar su lógica interna): el favicon con inicial replica el
 * MISMO concepto que el fallback ya existente en `app-sidebar.tsx`
 * (letra sobre un color de marca, contraste WCAG AA), pero como imagen
 * aparte -- el favicon no puede leer clases/variables CSS del DOM.
 */

/** 64px alcanza para el tamaño real que renderiza un favicon (16-48px en la
 * mayoría de navegadores) sin generar un data URI innecesariamente grande. */
const FAVICON_SIZE = 64;

/**
 * Subconjunto de `HTMLCanvasElement` que necesitan las funciones de este
 * archivo -- inyectable a propósito. jsdom (entorno de test, ver
 * `vitest.config.ts`) no implementa `getContext("2d")` sin el paquete
 * nativo `canvas` (no instalado; agregarlo sería una dependencia nueva sin
 * declarar, AGENTS.md §2.1), así que los tests pasan un canvas falso acá en
 * vez de mockear el DOM global. En producción, `createRealCanvas` (abajo)
 * construye uno real con `document.createElement("canvas")`.
 */
export interface CanvasFavicon {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D | null;
  toDataURL(type?: string): string;
}

function tripletToRgbCss(triplet: string): string {
  return `rgb(${triplet.split(" ").join(", ")})`;
}

/** Primera letra visible del nombre de marca, en mayúscula -- mismo criterio
 * que `nombreMarca[0]?.toUpperCase() ?? "I"` de `app-sidebar.tsx` (no se
 * reusa esa línea porque vive en un componente que este módulo no debe
 * tocar/importar, ver alcance duro de la tarea), recortando espacios para
 * que un nombre con espacio inicial no devuelva un carácter en blanco. */
export function inicialMarca(nombreMarca: string): string {
  return nombreMarca.trim().charAt(0).toUpperCase() || "I";
}

/**
 * Dibuja el favicon de fallback (círculo con `colorPrimario` de fondo +
 * inicial en el color de mayor contraste) sobre un canvas ya construido, y
 * devuelve su data URI. Recibe el canvas en vez de crearlo para que la
 * lógica de dibujo sea testeable sin canvas real (ver `CanvasFavicon`).
 */
export function drawFaviconLetter(
  canvas: CanvasFavicon,
  letter: string,
  colorPrimarioHex: string,
): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Entorno sin soporte de canvas 2d (limitación conocida, nunca debería
    // pasar en un navegador real) -- sin favicon generado antes que roto.
    return "";
  }

  const backgroundTriplet = hexToRgbTriplet(colorPrimarioHex);
  const foregroundTriplet = foregroundForContrast(backgroundTriplet);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY);

  ctx.fillStyle = tripletToRgbCss(backgroundTriplet);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = tripletToRgbCss(foregroundTriplet);
  ctx.font = `${Math.round(canvas.width * 0.55)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, centerX, centerY);

  return canvas.toDataURL("image/png");
}

function createRealCanvas(): CanvasFavicon {
  const element = document.createElement("canvas");
  element.width = FAVICON_SIZE;
  element.height = FAVICON_SIZE;
  return element;
}

/**
 * Favicon de fallback completo: resuelve la inicial del nombre de marca y
 * dibuja sobre un canvas real (o el inyectado en tests). `createCanvas` es
 * opcional para que el código de producción (`AppLayout.tsx`) no tenga que
 * conocer `CanvasFavicon` -- solo los tests lo inyectan.
 */
export function generateFaviconLetterDataUri(
  nombreMarca: string,
  colorPrimarioHex: string,
  createCanvas: () => CanvasFavicon = createRealCanvas,
): string {
  return drawFaviconLetter(createCanvas(), inicialMarca(nombreMarca), colorPrimarioHex);
}

/**
 * Favicon a mostrar en la pestaña: el logo real de la empresa si existe
 * (`resolveLogoMarca`, `color-marca.ts`), o si no, el favicon con inicial
 * generado acá -- mismo criterio de 2 niveles que ya usa `app-sidebar.tsx`
 * para su propio fallback visual (nunca un ícono genérico inventado).
 */
export function resolveFaviconHref(
  logoMarca: string | null,
  nombreMarca: string,
  colorPrimarioHex: string,
  createCanvas?: () => CanvasFavicon,
): string {
  if (logoMarca) {
    return logoMarca;
  }
  return generateFaviconLetterDataUri(nombreMarca, colorPrimarioHex, createCanvas);
}

/**
 * Actualiza (o crea, si `index.html` todavía no lo tiene para esta carga)
 * el `<meta name="theme-color">` que tiñe la barra de pestaña/dirección en
 * Chrome y Safari mobile -- mismo color que usa el sidebar
 * (`colorPrimario`, ver `resolveEstilosMarca`/`resolveMarcaCompleta`).
 */
export function updateThemeColor(colorHex: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", colorHex);
}

/**
 * Actualiza (o crea) el `<link rel="icon">` del documento con el `href`
 * resuelto por `resolveFaviconHref` -- logo real de la empresa, o el data
 * URI del favicon con inicial generado por canvas.
 */
export function updateFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "icon");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}
