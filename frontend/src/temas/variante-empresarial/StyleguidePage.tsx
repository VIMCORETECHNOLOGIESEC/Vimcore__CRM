import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { LeadsTable } from "@/funcionalidades/leads/LeadsTable";
import { SemaforoBadge } from "@/funcionalidades/leads/SemaforoBadge";
import { cn } from "@/lib/utils";
import type { Lead } from "@/tipos/lead";
import { SidebarIndigoPreview } from "./SidebarIndigoPreview";
import { WelcomeSplashLoader } from "./WelcomeSplashLoader";
import "./tema-empresarial.css";

/**
 * Catálogo de referencia de la variante de tema "Propuesta B -- Consejo
 * directivo (empresarial premium)". Código real dentro de `frontend/src/`,
 * no un mock HTML nuevo -- demuestra que la dirección visual documentada en
 * `.interface-design/system.md` es realizable con el stack ya instalado
 * (React 19 + Tailwind 3.4 compilado + shadcn/Radix, sin dependencias de
 * animación JS).
 *
 * Renombrado de presentación (2026-08-28): puertas afuera esta página se
 * llama "Directorio" -- doble sentido a propósito ("consejo directivo" +
 * "catálogo/directorio de componentes"). El nombre interno de la propuesta
 * ("Consejo directivo") y el scope CSS (`.tema-empresarial`) NO cambian --
 * ver `tema-empresarial.css`.
 *
 * Segunda pasada estructural (2026-08-28): reemplaza las 12 secciones planas
 * apiladas (título + grilla, una tras otra) por una lectura tipo dossier
 * corporativo -- portada, sumario y doce fichas numeradas -- reutilizando
 * exactamente los mismos componentes/tokens ya aprobados de cada sección
 * (`ElementoCard`, `GrillaCatalogo`, `FRAME_RADIUS_CLASSES`, los tokens de
 * `tema-empresarial.css`). Ningún elemento del catálogo cambió de contenido
 * ni de comportamiento -- solo la estructura de la página alrededor de ellos.
 *
 * Finalidad explícita (no es una app funcional montada): presentar en cards
 * cada elemento del tema -- nombre, muestra visual renderizada de verdad, y
 * una nota corta de su función y dónde se usa/usaría en la app real.
 *
 * Ruta dev-only (`/temas/empresarial`, ver `router.tsx`), fuera de
 * `layouts/navigation.ts` a propósito -- no debe aparecer en el sidebar de
 * producción. Ver `frontend/src/temas/README.md` para la convención general
 * de "variante de tema".
 *
 * Los tokens de color/tipografía de esta variante (índigo sobre papel
 * cálido, Fraunces + Source Sans 3) están scopeados bajo la clase
 * `.tema-empresarial` (`./tema-empresarial.css`) -- distintos de la línea
 * gráfica base real del proyecto (candidato "hueso" C1 en revisión --
 * `#F5F3EE` + azul `#2563EB`, ver `src/index.css`).
 */
export function StyleguidePage() {
  return (
    <>
      <div
        id="tema-empresarial-root"
        className="tema-empresarial scrollbar-themed h-full overflow-y-auto"
      >
        {/*
          `index.css` fija `overflow-hidden` en html/body/#root a propósito --
          solo `main` de AppLayout tiene su propio scroll interno (ver ese
          comentario). Esta página no cuelga de AppLayout (es una ruta dev-only
          fuera del árbol protegido), así que necesita su propio contenedor con
          scroll -- sin esto, todo lo que no entra en un viewport queda
          renderizado pero inalcanzable. El scroll suave de los anclas del
          sumario hacia cada ficha vive en `tema-empresarial.css`, scopeado a
          este mismo `id` -- respeta `prefers-reduced-motion`.
        */}
        {/*
          React 19 hoista automáticamente <link>/<meta>/<title> renderizados en
          cualquier parte del árbol hacia <head> -- no hace falta un efecto
          manual para cargar las fuentes de Google Fonts de esta variante.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Source+Sans+3:wght@400;500;600;700&display=swap"
        />

        <Portada />
        <Sumario />

        <main className="patron-papel">
          <Ficha meta={FICHAS[0]}>
            <SeccionFundaciones />
          </Ficha>
          <Ficha meta={FICHAS[1]}>
            <SeccionFondoMain />
          </Ficha>
          <Ficha meta={FICHAS[2]}>
            <SeccionShellReal />
          </Ficha>
          <Ficha meta={FICHAS[3]}>
            <SeccionInputs />
          </Ficha>
          <Ficha meta={FICHAS[4]}>
            <SeccionBotones />
          </Ficha>
          <Ficha meta={FICHAS[5]}>
            <SeccionTabs />
          </Ficha>
          <Ficha meta={FICHAS[6]}>
            <SeccionSelects />
          </Ficha>
          <Ficha meta={FICHAS[7]}>
            <SeccionBadges />
          </Ficha>
          <Ficha meta={FICHAS[8]}>
            <SeccionTarjetas />
          </Ficha>
          <Ficha meta={FICHAS[9]}>
            <SeccionEstados />
          </Ficha>
          <Ficha meta={FICHAS[10]}>
            <SeccionWelcomeSplash />
          </Ficha>
          <Ficha meta={FICHAS[11]}>
            <SeccionLeadsTable />
          </Ficha>
        </main>
      </div>
      {/*
        Nodo de portal DEDICADO, hermano de `#tema-empresarial-root` -- NUNCA
        un hijo directo de ese div (ver la nota histórica sobre `space-y-16`
        corriendo un overlay `fixed inset-0` 64px hacia abajo, ya no aplica
        acá porque este div ya no usa esa utilidad, pero el portal se mantiene
        afuera de todos modos: sigue siendo el contrato más simple y a prueba
        de que un futuro cambio de spacing interno lo rompa de nuevo). Este
        nodo vive fuera de ese flujo pero sigue llevando la clase
        `tema-empresarial` para heredar las variables/selectores scopeados
        de esta variante.
      */}
      <div id="tema-empresarial-portal-root" className="tema-empresarial" />
    </>
  );
}

/**
 * Portada -- primer golpe de vista del dossier, altura de viewport completa.
 * Mismo tratamiento "hero" que el panel de marca del login y el welcome
 * splash: `.chrome-gradiente`/fondo de 3 capas (`.dossier-portada`,
 * `tema-empresarial.css`, copiado 1:1 del fondo de `.welcome-splash` -- es
 * exactamente el mismo tipo de momento, una pantalla de un solo golpe sin
 * navegación que escanear) + wordmark en Fraunces sobre `--papel`.
 */
function Portada() {
  return (
    <header className="dossier-portada flex flex-col justify-between px-6 py-12 sm:px-12 sm:py-16">
      <p className="dossier-colofon">Catálogo de referencia · dev-only</p>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <h1 className="headline text-6xl font-semibold tracking-wide !text-[var(--papel)] sm:text-7xl md:text-8xl">
          Directorio
        </h1>
        <p className="max-w-xl text-base !text-[var(--papel)] opacity-75 sm:text-lg">
          Sistema de componentes — CRM Embudo de Leads.
        </p>
      </div>
      <p className="dossier-colofon text-center sm:text-right">
        28/08/2026 · Propuesta B — Consejo directivo
      </p>
    </header>
  );
}

interface FichaMeta {
  numero: number;
  id: string;
  titulo: string;
  rationale: ReactNode;
}

/**
 * Metadatos de cada ficha -- fuente única para el Sumario (número + título +
 * razón de ser) y para el eyebrow/título/razón de ser repetidos arriba de
 * cada ficha más abajo. La razón de ser de cada entrada está anclada en una
 * regla real ya documentada en el propio catálogo/CSS (no es texto de
 * relleno inventado) -- ver la nota de cada `Seccion*` de abajo para la
 * fuente completa de cada afirmación.
 */
const FICHAS: FichaMeta[] = [
  {
    numero: 1,
    id: "ficha-01",
    titulo: "Fundaciones",
    rationale:
      "El semáforo (verde/ámbar/rojo/gris) y la paleta categórica son un contrato de producto fijo, compartido por cualquier variante visual futura. Fraunces separa la identidad de marca (headlines, sellos) de Source Sans 3, la tipografía de trabajo del resto de la interfaz.",
  },
  {
    numero: 2,
    id: "ficha-02",
    titulo: "Superficie",
    rationale:
      "El contenido nunca se apoya sobre blanco puro: el papel cálido (--papel) es el fondo que reemplazaría al bg-background actual del layout si esta dirección se adopta.",
  },
  {
    numero: 3,
    id: "ficha-03",
    titulo: "Navegación",
    rationale:
      "El chrome funcional (sidebar, header, tabla) usa índigo sólido, nunca gradiente -- se probó un gradiente completo y se revirtió el mismo día: en una superficie que se escanea todo el tiempo, un gradiente es ruido, no jerarquía.",
  },
  {
    numero: 4,
    id: "ficha-04",
    titulo: "Campos",
    rationale:
      "Ningún buscador de texto libre existe en el CRM -- el filtrado se resuelve siempre con selects/combos acotados. Esta ficha generaliza el input ya aprobado del login al resto de los formularios, misma familia visual, algo más densa.",
  },
  {
    numero: 5,
    id: "ficha-05",
    titulo: "Acciones",
    rationale:
      "Cada acción tiene un único peso visual esperado: primaria para cerrar, destructiva para lo irreversible -- siempre con confirmación explícita --, ghost para lo secundario y enlace para navegación en línea con el texto.",
  },
  {
    numero: 6,
    id: "ficha-06",
    titulo: "Organización",
    rationale:
      "Candidato para separar leads pendientes de leads cerrados dentro de una misma vista, sin duplicar la tabla ni sumar una pantalla nueva.",
  },
  {
    numero: 7,
    id: "ficha-07",
    titulo: "Selección",
    rationale:
      "Los filtros de red social y campaña -- en el dashboard y en el listado de leads -- se resuelven con este control, nunca con un input de texto libre (ver Ficha 04).",
  },
  {
    numero: 8,
    id: "ficha-08",
    titulo: "Estado",
    rationale:
      "El semáforo de un lead nunca es solo color: siempre lleva una etiqueta de texto al lado. No es una preferencia estética, es un requisito de accesibilidad fijo del proyecto.",
  },
  {
    numero: 9,
    id: "ficha-09",
    titulo: "Contenedores",
    rationale:
      "La pestaña de color de cada tarjeta de KPI varía por categoría en vez de repetir un único índigo en las siete del dashboard -- evita que el panel se lea como la misma tarjeta multiplicada por siete.",
  },
  {
    numero: 10,
    id: "ficha-10",
    titulo: "Retroalimentación",
    rationale:
      "Ninguna vista queda en blanco sin explicación: carga, vacío y error son estados obligatorios, y un error de red siempre se traduce a un mensaje accionable en español, nunca a un código HTTP crudo.",
  },
  {
    numero: 11,
    id: "ficha-11",
    titulo: "Bienvenida",
    rationale:
      "Overlay a pantalla completa mostrado al entrar a la app, antes de montar el layout -- reemplaza al sello de boot circular/puntos, descartado como propuesta de arranque.",
  },
  {
    numero: 12,
    id: "ficha-12",
    titulo: "Datos",
    rationale:
      "Componente real de producción, sin reimplementar: ocho leads mock cubren las cinco etapas, los cuatro semáforos y los cuatro estados de SLA posibles, para que la tabla se vea viva y no como una fila repetida ocho veces.",
  },
];

/**
 * Sumario -- tabla de contenidos del dossier, sobre el mismo `.patron-papel`
 * que el resto del canvas de contenido. Cada entrada es un ancla nativa
 * (`href="#ficha-XX"`) hacia su ficha correspondiente -- sin librería de
 * scroll, el `scroll-behavior: smooth` scopeado a esta página
 * (`tema-empresarial.css`) alcanza.
 */
function Sumario() {
  return (
    <nav aria-label="Sumario" className="patron-papel px-6 py-16 sm:px-12 md:py-24">
      <div className="mx-auto max-w-3xl space-y-10">
        <div className="space-y-2">
          <p className="login-label">Sumario</p>
          <h2 className="headline text-2xl font-semibold">
            Doce fichas, un componente real detrás de cada una
          </h2>
        </div>
        <ol className="ledger-divider">
          {FICHAS.map((ficha) => (
            <li key={ficha.id} className="ledger-divider">
              <a
                href={`#${ficha.id}`}
                className="group flex items-baseline gap-4 py-4 no-underline"
              >
                <span className="tabular headline text-3xl font-semibold !text-[var(--indigo)] opacity-40 transition-opacity group-hover:opacity-70">
                  {String(ficha.numero).padStart(2, "0")}
                </span>
                <span className="flex-1">
                  <span className="headline block text-lg font-semibold !text-[var(--indigo)]">
                    {ficha.titulo}
                  </span>
                  <span className="block text-sm opacity-70">{ficha.rationale}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

/**
 * Spread de dos columnas de cada ficha (`.dossier-ficha-grid`,
 * `tema-empresarial.css`): columna angosta con el eyebrow "Ficha 0X" (mismo
 * tratamiento tipográfico `.login-label` que el resto de la variante) +
 * título + razón de ser en lenguaje llano; columna flexible con la(s)
 * muestra(s) viva(s) -- el contenido real de cada `Seccion*` de abajo, sin
 * cambios de comportamiento. Apilada en mobile, dos columnas desde `md`.
 */
function Ficha({ meta, children }: { meta: FichaMeta; children: ReactNode }) {
  const tituloId = `${meta.id}-titulo`;
  return (
    <section id={meta.id} aria-labelledby={tituloId} className="ledger-divider px-6 py-16 sm:px-12 md:py-20">
      <div className="dossier-ficha-grid mx-auto max-w-6xl">
        <div className="space-y-3">
          <p className="login-label">Ficha {String(meta.numero).padStart(2, "0")}</p>
          <h2 id={tituloId} className="headline text-2xl font-semibold">
            {meta.titulo}
          </h2>
          <p className="max-w-sm text-sm leading-relaxed opacity-70">{meta.rationale}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/**
 * Entrada individual del catálogo: nombre del elemento + muestra visual
 * renderizada de verdad (no una captura) + nota corta de dónde se usa. Es el
 * bloque repetido en cada ficha, al estilo de la documentación de
 * componentes de un framework (Bootstrap/Storybook) -- nunca una app
 * funcional montada.
 */
const FRAME_RADIUS_CLASSES = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
} as const;

function ElementoCard({
  titulo,
  nota,
  children,
  className,
  align = "center",
  frameClassName,
  frameRadius = "sm",
  frameBorder = true,
}: {
  titulo: string;
  nota: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * `"start"` para elementos con overlay/dropdown (combobox, select abierto):
   * el trigger queda pegado arriba del frame en vez de centrado a mitad de
   * una card alta, así el popover abre cerca del borde superior en vez de
   * flotar a mitad de altura, superpuesto con la card vecina.
   */
  align?: "center" | "start";
  /** Alto del frame de muestra -- por defecto crece parejo con las cards de la fila; pasar un `min-h-[...]` puntual para contenido que necesita más aire real (overlays) en vez de heredar la altura genérica compartida. */
  frameClassName?: string;
  /**
   * Radio del frame de muestra -- deliberadamente NO uniforme entre
   * fichas (evitar "misma card × N", `interface-design`): `"sm"` para
   * controles simples (botones, selects), `"md"` para composites
   * (tabs, tarjetas), `"lg"` para contenido "vivo" embebido (sidebar,
   * welcome splash). Ver también `frameBorder`.
   */
  frameRadius?: keyof typeof FRAME_RADIUS_CLASSES;
  /**
   * `false` retira el recuadro punteado + fondo papel del frame -- para
   * elementos cuya propia forma (ej. el sello circular del boot) no debe
   * quedar encerrada en el mismo rectángulo genérico que el resto; refuerza
   * el contraste de forma en vez de diluirlo.
   */
  frameBorder?: boolean;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 border-[rgba(30,42,94,0.18)] bg-[var(--papel)] p-4 shadow-[0_8px_24px_-8px_rgba(30,42,94,0.18)]",
        className,
      )}
    >
      <p className="headline text-sm font-semibold">{titulo}</p>
      <div
        className={cn(
          "flex flex-1 justify-center p-4",
          align === "start" ? "items-start" : "items-center",
          frameBorder
            ? cn(
                FRAME_RADIUS_CLASSES[frameRadius],
                "border border-dashed border-[rgba(30,42,94,0.15)] bg-[var(--papel)]",
              )
            : "bg-transparent",
          frameClassName,
        )}
      >
        {children}
      </div>
      <p className="text-xs leading-relaxed opacity-60">{nota}</p>
    </Card>
  );
}

/**
 * Grilla estándar del catálogo -- 1/2/3 columnas según el viewport por
 * defecto. `columnaUnica` fuerza una sola columna en TODOS los breakpoints
 * (contenido ancho: tabla, preview de sidebar, splash) -- un `className`
 * suelto con `grid-cols-1` no alcanza para esto: `tailwind-merge` agrupa por
 * modificador, así que `grid-cols-1` (sin prefijo) nunca cancela
 * `sm:grid-cols-2`/`lg:grid-cols-3` (grupos de merge distintos) y la card
 * termina apretada a 1/2 o 1/3 del ancho real en pantallas grandes.
 */
function GrillaCatalogo({
  children,
  className,
  columnaUnica = false,
}: {
  children: ReactNode;
  className?: string;
  columnaUnica?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columnaUnica ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SeccionFundaciones() {
  const swatches: { nombre: string; valor: string; token: string }[] = [
    { nombre: "Índigo", valor: "#1E2A5E", token: "--indigo" },
    { nombre: "Índigo 2 (texto)", valor: "#14204A", token: "--indigo-2" },
    { nombre: "Papel", valor: "#F6F1E7", token: "--papel" },
    { nombre: "Verde · caliente", valor: "#16A34A", token: "--verde" },
    { nombre: "Ámbar · tibio", valor: "#D97706", token: "--amarillo" },
    { nombre: "Rojo · frío", valor: "#DC2626", token: "--rojo" },
    { nombre: "Gris · sin calificar", valor: "#94A3B8", token: "--gris-semaforo" },
    { nombre: "Categórico 1", valor: "#DB2777", token: "--cat-1" },
    { nombre: "Categórico 2", valor: "#2563EB", token: "--cat-2" },
    { nombre: "Categórico 3", valor: "#7C3AED", token: "--cat-3" },
    { nombre: "Categórico 4", valor: "#0891B2", token: "--cat-4" },
  ];

  return (
    <GrillaCatalogo className="lg:grid-cols-2">
      <ElementoCard
        titulo="Paleta de color"
        nota="Tokens fijos de esta dirección (.interface-design/system.md, «Propuesta B -- fijo»). El semáforo y la paleta categórica son contrato de producto compartido por cualquier variante futura, no exclusivos de esta."
      >
        <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-4">
          {swatches.map((s) => (
            <div key={s.token} className="space-y-1">
              {/* `style` real acá, no un desvío de la regla "sin CSS-in-JS": el hex
                  viene de datos (`s.valor`, un token distinto por swatch), Tailwind
                  JIT solo genera clases para strings literales presentes en el código
                  fuente -- no puede extraer un valor calculado en runtime. */}
              <div
                className="h-10 w-full rounded-sm border border-[rgba(30,42,94,0.18)]"
                style={{ background: s.valor }}
              />
              <p className="text-[10px] font-medium leading-tight">{s.nombre}</p>
              <p className="tabular text-[10px] leading-tight opacity-60">{s.valor}</p>
            </div>
          ))}
        </div>
      </ElementoCard>
      <ElementoCard
        titulo="Tipografía"
        nota="Fraunces (display serif, headlines y sellos) + Source Sans 3 (cuerpo sans, texto de UI y tablas) -- el concepto del par es la identidad, no los pesos/tamaños exactos."
      >
        <div className="flex flex-col gap-3">
          <p className="headline text-2xl font-semibold">Fraunces — Consejo directivo</p>
          <p className="text-2xl font-semibold" style={{ fontFamily: "'Source Sans 3', sans-serif" }}>
            Source Sans 3 — cuerpo de trabajo
          </p>
        </div>
      </ElementoCard>
    </GrillaCatalogo>
  );
}

function SeccionFondoMain() {
  return (
    <GrillaCatalogo>
      <ElementoCard
        titulo="Superficie de contenido (--papel)"
        nota="Fondo del `main` en esta variante: papel cálido #F6F1E7, nunca blanco puro. Reemplazaría el `bg-background` blanco actual de `frontend/src/layouts/AppLayout.tsx` si esta dirección se adopta."
      >
        <div className="flex h-24 w-full items-center justify-center rounded-sm border border-[rgba(30,42,94,0.18)] bg-[var(--papel)] text-sm opacity-70">
          --papel
        </div>
      </ElementoCard>
    </GrillaCatalogo>
  );
}

function SeccionShellReal() {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm opacity-70">
        El tema neutro F1 (componente real tal cual producción, fondo hueso compartido con el
        canvas) se descartó como alternativa visual para esta dirección -- ya no se muestra acá. La
        única propuesta de sidebar/topbar de Propuesta B es la de chrome sólido índigo, decisión
        Fijo. Pasó por una versión con gradiente de marca completo el mismo día (2026-08-28) y se
        revirtió tras feedback + research: el gradiente queda reservado a momentos "hero" (login,
        splash), nunca a chrome funcional. Ver <code>.interface-design/system.md</code>,{" "}
        "Propuesta B -- Fijo".
      </p>
      <GrillaCatalogo columnaUnica>
        <ElementoCard
          titulo="Sidebar + Topbar — índigo sólido (nueva propuesta, interactiva)"
          nota={
            <>
              Mockup nuevo (<code>SidebarIndigoPreview.tsx</code>), no el componente real: fondo
              sólido índigo <code>#1E2A5E</code> (<code>.chrome-solido</code>,{" "}
              <code>tema-empresarial.css</code>) para sidebar y header -- ya no comparten el fondo
              hueso del canvas. Pasó por un gradiente de marca completo (2026-08-28) y se revirtió
              el mismo día: research real (Stripe/Linear/Vercel, UX Collective) confirma que
              productos premium usan el color con restricción -- gradiente en navegación que se
              escanea todo el tiempo es ruido, no jerarquía; además el mismo ángulo diagonal
              aplicado a formas distintas (panel vertical, barra horizontal, header de tabla) da
              resultados visuales inconsistentes entre sí. El gradiente queda reservado a{" "}
              <code>.chrome-gradiente</code> -- SOLO el panel de marca del login y el welcome
              splash, los momentos "hero" reales de esta variante. Canvas debajo con{" "}
              <code>.patron-papel</code>{" "}
              (misma retícula del login) -- eso sí se mantuvo. Texto hueso <code>#F5F3EE</code>{" "}
              (100% en el ítem activo, ~65% en los inactivos, contraste validado 12.2:1). Ítem
              activo: pill sólido en el azul de acento <code>#2563EB</code> (ya definido como{" "}
              <code>--cat-2</code>, no un color nuevo) con texto blanco (contraste validado 5.17:1)
              + <code>ring-1 ring-white/10</code> para distinguirlo del índigo de fondo -- reemplaza
              el borde-izquierdo, que no se lee bien sobre un fondo ya coloreado. Sin borde
              divisorio hacia el canvas: el contraste índigo/hueso ya marca el límite; el
              sidebar/header proyectan sombra propia (<code>.chrome-sombra-derecha</code>/
              <code>.chrome-sombra-abajo</code>, se mantiene igual con o sin gradiente) para
              reforzar la separación con profundidad. Reutiliza los datos reales de{" "}
              <code>layouts/navigation.ts</code> (mismas etiquetas/rutas/íconos), no la
              implementación visual del sidebar real. Clickeá un ítem: alterna cuál se ve activo
              con estado local de React, sin navegar de verdad.
            </>
          }
          frameRadius="lg"
        >
          <div className="w-full overflow-hidden rounded-lg">
            <SidebarIndigoPreview />
          </div>
        </ElementoCard>
      </GrillaCatalogo>
    </div>
  );
}

function SeccionInputs() {
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm opacity-70">
        Ningún buscador de texto libre existe en el CRM, en ningún tema -- regla de producto fija
        (<code>.interface-design/system.md</code>, "Estructura compartida"): el filtrado se
        resuelve con selects/combos acotados (<code>LeadsFiltros.tsx</code>,{" "}
        <code>ResponsableCombobox.tsx</code>), nunca con un input de búsqueda libre. Esta sección
        generaliza el patrón de input ya aprobado del login (<code>.login-input</code>,{" "}
        <code>LoginScreenDemo.tsx</code>) a los controles de formulario del resto de la app --
        misma familia visual (<code>.control-input</code>, <code>tema-empresarial.css</code>),
        altura más densa (40px vs. los 44px "aireados" del login, pensado para una pantalla de un
        solo momento).
      </p>
      <GrillaCatalogo>
        <ElementoCard
          titulo="Texto"
          nota="`components/ui/input.tsx` (sin reimplementar el control) -- ej. nombre del cliente en un formulario de alta manual."
        >
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="demo-input-nombre" className="login-label">
              Nombre del cliente
            </Label>
            <Input id="demo-input-nombre" placeholder="Ana Torres" className="control-input" />
          </div>
        </ElementoCard>
        <ElementoCard
          titulo="Con error"
          nota={
            <>
              <code>aria-invalid</code> -- ya soportado por el primitivo compartido, acá con el
              anillo en <code>--rojo</code> (el mismo rojo del semáforo, no el rojo default de
              shadcn): mismo lenguaje de foco de dos capas que el estado normal, en rojo.
            </>
          }
        >
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="demo-input-telefono" className="login-label">
              Teléfono
            </Label>
            <Input
              id="demo-input-telefono"
              defaultValue="099123"
              aria-invalid="true"
              className="control-input"
            />
            <p className="text-xs !text-[var(--rojo)]">
              Ingresa un teléfono válido.
            </p>
          </div>
        </ElementoCard>
        <ElementoCard
          titulo="Deshabilitado"
          nota="Estado inactivo -- opacidad reducida del primitivo compartido, sin cambios."
        >
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="demo-input-disabled" className="login-label">
              Código de referido
            </Label>
            <Input id="demo-input-disabled" defaultValue="—" disabled className="control-input" />
          </div>
        </ElementoCard>
        <ElementoCard
          titulo="Checkbox"
          nota={
            <>
              <code>components/ui/checkbox.tsx</code> -- selección de filas en{" "}
              <code>LeadsTable.tsx</code>. Acento <code>--cat-2</code> al marcar en vez del azul
              genérico de esa variante.
            </>
          }
        >
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked className="control-checkbox" />
            Notificar por correo
          </label>
        </ElementoCard>
      </GrillaCatalogo>
    </div>
  );
}

function SeccionBotones() {
  return (
    <div className="space-y-4">
      <GrillaCatalogo columnaUnica>
        <ElementoCard
          titulo="Hero (protagonista de la pantalla)"
          frameBorder={false}
          frameClassName="hero-spotlight"
          nota={
            <>
              Excepción deliberada y acotada a la regla de "sin gradiente en chrome" (Ficha 03): un
              botón hero es el único lugar puntual, igual que <code>.login-boton-primario</code>,
              donde el gradiente de marca (<code>.chrome-gradiente</code>) sí construye jerarquía sin
              costo de usabilidad. Regla de uso, no solo de estilo: <strong>como máximo uno por
              pantalla</strong>, reservado a la acción protagonista (ej. «Nueva oportunidad» del
              dashboard, el submit final de un wizard) -- nunca en una fila de tabla ni en una toolbar
              donde conviven varias acciones, ahí volvería a ser ruido, no jerarquía. El fondo oscuro
              tintado de este frame ("spotlight") es a propósito distinto del recuadro punteado plano
              del resto de variantes de abajo -- que el botón "viva" en otra superficie hace legible la
              regla de un vistazo, sin depender solo de leer la nota.
            </>
          }
        >
          <Button className="boton-catalogo boton-hero">Nueva oportunidad</Button>
        </ElementoCard>
      </GrillaCatalogo>
      <GrillaCatalogo className="sm:grid-cols-3 lg:grid-cols-4">
        <ElementoCard titulo="Primario" nota="Acción principal de una vista (ej. confirmar cierre de venta).">
          <Button className="boton-catalogo boton-primario">Primario</Button>
        </ElementoCard>
        <ElementoCard titulo="Secundario (outline)" nota="Acción secundaria junto a un primario (ej. «Cancelar»).">
          <Button variant="outline" className="boton-catalogo boton-secundario">
            Secundario
          </Button>
        </ElementoCard>
        <ElementoCard
          titulo="Destructivo"
          nota="Acciones irreversibles (ej. cerrar lead, desactivar usuario) -- siempre con confirmación explícita. Mismo rojo del semáforo (`--rojo`), no el rojo default de shadcn."
        >
          <Button variant="destructive" className="boton-catalogo boton-destructivo">
            Destructivo
          </Button>
        </ElementoCard>
        <ElementoCard titulo="Ghost" nota="Acciones de bajo énfasis dentro de un panel (ej. íconos del header).">
          <Button variant="ghost" className="boton-catalogo boton-ghost">
            Ghost
          </Button>
        </ElementoCard>
        <ElementoCard titulo="Enlace" nota="Navegación en línea con el texto (ej. «Mi perfil» dentro de un párrafo).">
          <Button variant="link" className="boton-enlace">
            Enlace
          </Button>
        </ElementoCard>
        <ElementoCard titulo="Deshabilitado" nota="Estado inactivo mientras una precondición no se cumple (ej. formulario inválido).">
          <Button disabled className="boton-catalogo boton-primario">
            Deshabilitado
          </Button>
        </ElementoCard>
      </GrillaCatalogo>
    </div>
  );
}

function SeccionTabs() {
  return (
    <GrillaCatalogo>
      <ElementoCard
        titulo="Tabs"
        nota={
          <>
            Nuevo: <code>frontend/src/components/ui/tabs.tsx</code> (Radix{" "}
            <code>@radix-ui/react-tabs</code>). Candidato para las pestañas «Pendientes/Cerrados»
            del listado de leads (F3, brecha P2 pendiente en{" "}
            <code>docs/07-modulos-frontend.md</code>).
          </>
        }
        frameRadius="md"
      >
        <Tabs defaultValue="pendientes" className="w-fit">
          <TabsList>
            <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
            <TabsTrigger value="cerrados">Cerrados</TabsTrigger>
          </TabsList>
          <TabsContent value="pendientes" className="text-sm opacity-70">
            Leads en etapas Nuevo, Contactado o Cita.
          </TabsContent>
          <TabsContent value="cerrados" className="text-sm opacity-70">
            Leads en Venta o No Venta.
          </TabsContent>
        </Tabs>
      </ElementoCard>
    </GrillaCatalogo>
  );
}

function SeccionSelects() {
  return (
    <GrillaCatalogo>
      <ElementoCard
        titulo="Select"
        nota={
          <>
            <code>frontend/src/components/ui/select.tsx</code> (ya existente) -- filtros del
            dashboard y de <code>LeadsFiltros.tsx</code> (red social, campaña).
          </>
        }
      >
        <Select defaultValue="todas">
          <SelectTrigger className="control-input w-56">
            <SelectValue placeholder="Red social" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Red social: Todas</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
          </SelectContent>
        </Select>
      </ElementoCard>
    </GrillaCatalogo>
  );
}

function SeccionBadges() {
  return (
    <GrillaCatalogo>
      <ElementoCard
        titulo="Semáforo de lead"
        nota={
          <>
            <code>frontend/src/funcionalidades/leads/SemaforoBadge.tsx</code> -- color + etiqueta
            de texto siempre juntos, nunca solo color. Usado en la tabla de leads (
            <code>LeadsTable.tsx</code>), la única vista de cartera de leads de este módulo.
          </>
        }
      >
        <div className="flex flex-wrap justify-center gap-2">
          <SemaforoBadge semaforo="VERDE" />
          <SemaforoBadge semaforo="AMARILLO" />
          <SemaforoBadge semaforo="ROJO" />
          <SemaforoBadge semaforo={null} />
        </div>
      </ElementoCard>
      <ElementoCard
        titulo="Badge — estado genérico"
        nota={
          <>
            Variantes nuevas de <code>components/ui/badge.tsx</code> (
            <code>success</code>/<code>warning</code>/<code>neutral</code>) -- ej. bridge
            activo/pausado/con avisos.
          </>
        }
      >
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="success">Activo</Badge>
          <Badge variant="warning">Con avisos</Badge>
          <Badge variant="neutral">Pausado</Badge>
        </div>
      </ElementoCard>
      <ElementoCard
        titulo="Badge — contador"
        nota={
          <>
            Variantes ya existentes de <code>badge.tsx</code>, sin tocar -- usadas hoy por{" "}
            <code>LeadsFiltros.tsx</code> (<code>secondary</code>, conteo de filtros avanzados) y{" "}
            <code>CampanaNotificaciones.tsx</code> (<code>destructive</code>, no leídas).
          </>
        }
      >
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="secondary">3 filtros</Badge>
          <Badge variant="destructive">9+</Badge>
        </div>
      </ElementoCard>
    </GrillaCatalogo>
  );
}

function SeccionTarjetas() {
  const kpis: { titulo: string; valor: string; color: string; delta: number }[] = [
    { titulo: "Total de leads ingresados", valor: "248", color: "var(--cat-2)", delta: 12.4 },
    { titulo: "Leads en gestión", valor: "96", color: "var(--cat-3)", delta: -4.1 },
    { titulo: "Tasa de conversión", valor: "24.6%", color: "var(--cat-1)", delta: 3.8 },
    { titulo: "Cumplimiento de SLA", valor: "88%", color: "var(--cat-4)", delta: -1.5 },
  ];

  return (
    <GrillaCatalogo>
      <ElementoCard
        titulo="KPI card (pestaña de color)"
        className="sm:col-span-2"
        nota={
          <>
            Nuevo: <code>frontend/src/components/ui/card.tsx</code>, variante <code>accent</code>{" "}
            -- KPI cards del dashboard (F5, 7 tarjetas). El color de la pestaña varía por
            categoría vía <code>accentColor</code> (paleta categórica fija) en vez de repetir un
            único índigo en las 7 tarjetas -- riesgo «misma card × 7» ya señalado en{" "}
            <code>.interface-design/system.md</code>. El delta bajo el número reutiliza el mismo
            color categórico de la pestaña de esa tarjeta (nunca un color nuevo tipo
            verde/rojo genérico de "sube/baja") -- y nunca como relleno de fondo de la card: 7
            fondos de color repetido lado a lado sería exactamente el mismo riesgo, solo
            trasladado del fondo al relleno.
          </>
        }
        frameRadius="md"
      >
        <div className="grid w-full grid-cols-2 gap-3">
          {kpis.map((kpi) => {
            const positivo = kpi.delta >= 0;
            const Flecha = positivo ? ArrowUp : ArrowDown;
            return (
              <Card
                key={kpi.titulo}
                variant="accent"
                accentColor={kpi.color}
                className="border-[rgba(30,42,94,0.12)] bg-[var(--papel)] shadow-[0_1px_2px_rgba(30,42,94,0.08)]"
              >
                <CardContent className="p-3">
                  <p className="text-[10px] opacity-60">{kpi.titulo}</p>
                  <p className="tabular text-3xl font-bold !text-[var(--indigo)]">
                    {kpi.valor}
                  </p>
                  {/* `style` real acá, mismo motivo que el swatch de Fundaciones:
                      `kpi.color` es un token de la paleta categórica por tarjeta,
                      calculado en runtime -- no hay clase Tailwind estática posible. */}
                  <p
                    className="tabular mt-1 flex items-center gap-1 text-[10px] font-semibold"
                    style={{ color: kpi.color }}
                  >
                    <Flecha className="size-3" aria-hidden="true" />
                    {positivo ? "+" : ""}
                    {kpi.delta.toFixed(1)}% vs. mes anterior
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ElementoCard>
      <ElementoCard
        titulo="Tarjeta genérica"
        nota="`variant=&quot;default&quot;`, sin pestaña -- paneles de gráficos del dashboard."
        frameRadius="md"
      >
        <Card className="w-full border-[rgba(30,42,94,0.18)] bg-[var(--papel)] shadow-[0_1px_2px_rgba(30,42,94,0.08)]">
          <CardHeader>
            <CardTitle>Leads por red social</CardTitle>
            <CardDescription>Panel genérico, sin acento de color.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm opacity-70">Contenido del gráfico iría acá.</CardContent>
        </Card>
      </ElementoCard>
    </GrillaCatalogo>
  );
}

function SeccionEstados() {
  return (
    <GrillaCatalogo>
      <ElementoCard titulo="Loading" nota="`frontend/src/componentes/states/LoadingState.tsx`, tal cual está.">
        <LoadingState rows={3} className="w-full" />
      </ElementoCard>
      <ElementoCard
        titulo="Vacío"
        nota={
          <>
            <code>frontend/src/componentes/states/EmptyState.tsx</code>, sin tocar el componente --
            restyle scoped vía <code>.estado-vacio-tema</code> (<code>tema-empresarial.css</code>),
            agregada solo acá en el call site. Fuera de esta variante, <code>EmptyState</code> se ve
            igual que siempre.
          </>
        }
      >
        <EmptyState
          className="w-full estado-vacio-tema"
          title="Sin leads en esta vista"
          description="Ajusta los filtros para ver resultados."
        />
      </ElementoCard>
      <ElementoCard
        titulo="Error"
        nota="`frontend/src/componentes/states/ErrorState.tsx`, tal cual está -- mensaje ya traducido, nunca un código HTTP crudo."
      >
        <ErrorState
          className="w-full"
          message="No se pudo cargar el listado de leads. Intenta de nuevo."
          onRetry={() => {}}
        />
      </ElementoCard>
    </GrillaCatalogo>
  );
}

/** Timings de la demo a pantalla completa (ms) -- sostenido "cargando" antes del fade-out. */
const DEMO_SPLASH_SOSTENIDO_MS = 2200;
/**
 * Buffer tras disparar el fade-out antes de desmontar el portal -- mayor a la
 * transición más larga que dispara `visible=false` en `tema-empresarial.css`
 * (`.welcome-splash-marca`: 650ms + 120ms delay = 770ms, subido desde
 * 500+80 el 2026-08-28 para un traspaso menos abrupto -- ver
 * `FlujoIntegracionDemo.tsx`), para no cortar la animación a mitad de
 * camino.
 */
const DEMO_SPLASH_DESMONTAJE_MS = 800;

function SeccionWelcomeSplash() {
  const [demoActivo, setDemoActivo] = useState(false);
  const [demoVisible, setDemoVisible] = useState(false);

  const reproducirDemoPantallaCompleta = () => {
    if (demoActivo) return;
    setDemoActivo(true);
    // Portal recién montado con `visible=false` (opacidad 0) -- un frame
    // después se agrega `is-visible` para que la transición de
    // opacity/transform dispare de verdad en vez de arrancar ya visible sin
    // animar (mismo motivo que el `void el.offsetWidth` de un replay CSS).
    requestAnimationFrame(() => setDemoVisible(true));
    window.setTimeout(() => {
      setDemoVisible(false);
      window.setTimeout(() => setDemoActivo(false), DEMO_SPLASH_DESMONTAJE_MS);
    }, DEMO_SPLASH_SOSTENIDO_MS);
  };

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm opacity-70">
        Nueva propuesta (kanban descartado -- el módulo de leads mantiene la tabla actual,{" "}
        <code>LeadsTable.tsx</code>): un overlay full-screen mostrado al entrar a la app, ANTES de
        montar el layout (<code>App.tsx</code>). La sección "Boot / animación de entrada" (el sello
        circular/puntos, <code>SelloBootLoader.tsx</code>) se descartó como propuesta -- este
        splash la reemplaza como dirección de carga de la app; el componente sigue en el repo sin
        usarse en este catálogo, solo su patrón de puntos (<code>.boot-dots</code>/
        <code>.boot-dot</code>) se reutiliza acá abajo. Misma paleta ya en uso en esta variante,
        ningún color nuevo.
      </p>
      <GrillaCatalogo columnaUnica>
        <ElementoCard
          titulo="Welcome splash — pantalla completa"
          nota={
            <>
              <code>WelcomeSplashLoader.tsx</code> -- fondo <code>--indigo</code> sólido (mismo
              índigo del sidebar/header) + marca en Fraunces sobre <code>--papel</code> + el mismo
              patrón de 3 puntos en <code>--cat-2</code> que definió el sello de boot descartado (
              <code>.boot-dots</code>/<code>.boot-dot</code>, reutilizado tal cual, no
              reimplementado). La card de acá es una referencia estática, contenida (
              <code>{'className="absolute inset-0"'}</code> pisa el <code>fixed inset-0</code> por
              defecto vía <code>tailwind-merge</code>, siempre visible, sin animar) -- el botón de
              abajo dispara la demo real: un <code>createPortal</code> dentro de{" "}
              <code>#tema-empresarial-portal-root</code>, un nodo hermano dedicado (NUNCA{" "}
              <code>document.body</code> a secas -- las variables{" "}
              <code>--indigo</code>/<code>--papel</code>/<code>--cat-2</code> y las reglas{" "}
              <code>.tema-empresarial .welcome-splash</code> están scopeadas por selector
              descendiente; y NUNCA hijo directo de <code>#tema-empresarial-root</code> tampoco --
              su spacing interno podría sumarle un margen extra a cualquier hijo que no sea el
              primero, corriendo el overlay hacia abajo). Con la posición{" "}
              <code>fixed inset-0</code> por defecto del componente (sin pisarla), tapa el viewport
              completo del navegador de verdad. Se sostiene ~2.2s "cargando" y se
              desvanece sola (mismo fade de 400-580ms de <code>tema-empresarial.css</code>) --
              al terminar desmonta el portal y vuelve a verse este catálogo detrás.
            </>
          }
          frameRadius="lg"
          frameClassName="relative min-h-64 w-full overflow-hidden"
        >
          <WelcomeSplashLoader
            contexto="Arcano Motos"
            mensaje="Cargando Arcano Motos…"
            visible
            className="absolute inset-0"
          />
          <Button
            variant="outline"
            className="absolute bottom-3 right-3 z-[60] bg-white/90"
            onClick={reproducirDemoPantallaCompleta}
            disabled={demoActivo}
          >
            {demoActivo ? "Reproduciendo…" : "Ver demo a pantalla completa"}
          </Button>
        </ElementoCard>
      </GrillaCatalogo>
      {demoActivo
        ? createPortal(
            <WelcomeSplashLoader
              contexto="Arcano Motos"
              mensaje="Cargando Arcano Motos…"
              visible={demoVisible}
            />,
            // `#tema-empresarial-portal-root`: nodo HERMANO dedicado, no
            // `document.body` (pierde `--indigo`/`--papel`/`--cat-2` y
            // `.tema-empresarial .welcome-splash`, selectores/variables
            // descendientes de `.tema-empresarial`) NI hijo directo de
            // `#tema-empresarial-root` (ver la nota de arriba). `position:
            // fixed` sigue cubriendo el viewport completo igual -- nada acá
            // arriba define un containing block nuevo
            // (`transform`/`filter`/`will-change`).
            document.getElementById("tema-empresarial-portal-root") ?? document.body,
          )
        : null}
    </div>
  );
}

/**
 * Cartera mock de la tabla de leads (F3, `LeadsTable.tsx`) -- 8 leads
 * ficticios elegidos para que el catálogo se vea "vivo", no una fila
 * repetida × 8:
 * - `etapa`: cubre las 5 (NUEVO, CONTACTADO, CITA, VENTA, NO_VENTA).
 * - `semaforo`: ROJO/AMARILLO/VERDE + un `null` (lead-1, "sin calificar" --
 *   ver `SemaforoBadge` en la Ficha 08 de arriba).
 * - `redSocial`: las 5 variantes de `RED_SOCIAL_ETIQUETAS`.
 * - `origen: "REINGRESO"` en lead-2 (dispara el badge "Reingreso" de la
 *   columna Cliente, ver `LeadsTable.tsx`).
 * - `correoPrincipal: null` en lead-1 (layout de la celda Cliente sin el
 *   subtexto de correo).
 * - `slaInicioEn`/`cerradoEn` calculados contra `Date.now()` en el momento en
 *   que este módulo se evalúa (una sola vez, no por render) para que
 *   `useSlaCountdown`/`calculateEstadoSla` (`sla.ts`, umbral de riesgo al
 *   25% del plazo de `SLA_HORAS = 24`) produzcan los 4 estados posibles:
 *   A_TIEMPO (lead-1/6/7), EN_RIESGO (lead-2/8, <=6h restantes),
 *   ATRASADO (lead-3, plazo vencido) y CERRADO (lead-4/5, `cerradoEn`
 *   seteado en etapa terminal).
 * - `asesor`/`vendedor`: combinaciones variadas (ambos, solo uno, ninguno)
 *   para que la columna Responsable (`getResponsable`: vendedor tiene
 *   prioridad sobre asesor) no quede siempre igual.
 *
 * Exportado (no solo local a este módulo) para que `AppShellDemo.tsx`
 * (`FlujoIntegracionDemo.tsx`) reutilice exactamente esta misma cartera mock
 * en vez de duplicar el array.
 */
export const LEADS_MOCK_STYLEGUIDE: Lead[] = [
  {
    id: "lead-styleguide-1",
    cliente: {
      id: "cliente-1",
      nombre: "Ana Torres",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: null,
    },
    campania: { id: "camp-1", nombre: "Lanzamiento línea urbana" },
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    semaforo: null,
    puntuacion: null,
    asesor: null,
    vendedor: null,
    slaInicioEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    cerradoEn: null,
  },
  {
    id: "lead-styleguide-2",
    cliente: {
      id: "cliente-2",
      nombre: "Roberto Salas",
      telefonoOriginal: "099-222-3344",
      telefonoNormalizado: "+593992223344",
      correoPrincipal: "roberto.salas@example.com",
    },
    campania: { id: "camp-2", nombre: "Feria motos 2026" },
    origen: "REINGRESO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "VERDE",
    puntuacion: 82,
    asesor: { id: "asesor-1", nombre: "Carla Núñez", rol: "ASESOR" },
    vendedor: null,
    slaInicioEn: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    cerradoEn: null,
  },
  {
    id: "lead-styleguide-3",
    cliente: {
      id: "cliente-3",
      nombre: "María Fernanda Ríos",
      telefonoOriginal: "0987654321",
      telefonoNormalizado: "+593987654321",
      correoPrincipal: "mf.rios@example.com",
    },
    campania: null,
    origen: "NUEVO",
    redSocial: "X",
    etapa: "CITA",
    semaforo: "AMARILLO",
    puntuacion: 55,
    asesor: { id: "asesor-2", nombre: "Diego Palacios", rol: "ASESOR" },
    vendedor: { id: "vendedor-1", nombre: "Sandra Molina", rol: "VENDEDOR" },
    slaInicioEn: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    cerradoEn: null,
  },
  {
    id: "lead-styleguide-4",
    cliente: {
      id: "cliente-4",
      nombre: "Jorge Iván Paredes",
      telefonoOriginal: "0976543210",
      telefonoNormalizado: "+593976543210",
      correoPrincipal: "jorge.paredes@example.com",
    },
    campania: { id: "camp-3", nombre: "Referidos internos" },
    origen: "NUEVO",
    redSocial: "LINKEDIN",
    etapa: "VENTA",
    semaforo: "VERDE",
    puntuacion: 95,
    asesor: { id: "asesor-1", nombre: "Carla Núñez", rol: "ASESOR" },
    vendedor: { id: "vendedor-2", nombre: "Luis Andrade", rol: "VENDEDOR" },
    slaInicioEn: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    cerradoEn: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    montoVenta: 4200,
    productoVendido: "Moto XR250",
    formaPago: "FINANCIAMIENTO",
  },
  {
    id: "lead-styleguide-5",
    cliente: {
      id: "cliente-5",
      nombre: "Lucía Andrade",
      telefonoOriginal: "0965432109",
      telefonoNormalizado: "+593965432109",
      correoPrincipal: "lucia.andrade@example.com",
    },
    campania: { id: "camp-4", nombre: "Google Forms — landing" },
    origen: "NUEVO",
    redSocial: "GOOGLE_FORMS",
    etapa: "NO_VENTA",
    semaforo: "ROJO",
    puntuacion: 18,
    asesor: { id: "asesor-3", nombre: "Pablo Rivas", rol: "ASESOR" },
    vendedor: null,
    slaInicioEn: new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString(),
    cerradoEn: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    observacionCierre: "Cliente decidió esperar a la siguiente promoción de fin de año.",
  },
  {
    id: "lead-styleguide-6",
    cliente: {
      id: "cliente-6",
      nombre: "Esteban Vaca",
      telefonoOriginal: "0954321098",
      telefonoNormalizado: "+593954321098",
      correoPrincipal: "esteban.vaca@example.com",
    },
    campania: { id: "camp-1", nombre: "Lanzamiento línea urbana" },
    origen: "NUEVO",
    redSocial: "FACEBOOK",
    etapa: "NUEVO",
    semaforo: "ROJO",
    puntuacion: 12,
    asesor: null,
    vendedor: null,
    slaInicioEn: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    cerradoEn: null,
  },
  {
    id: "lead-styleguide-7",
    cliente: {
      id: "cliente-7",
      nombre: "Paola Guerrero",
      telefonoOriginal: "0943210987",
      telefonoNormalizado: "+593943210987",
      correoPrincipal: "paola.guerrero@example.com",
    },
    campania: { id: "camp-2", nombre: "Feria motos 2026" },
    origen: "NUEVO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: null,
    puntuacion: null,
    asesor: { id: "asesor-2", nombre: "Diego Palacios", rol: "ASESOR" },
    vendedor: null,
    slaInicioEn: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    cerradoEn: null,
  },
  {
    id: "lead-styleguide-8",
    cliente: {
      id: "cliente-8",
      nombre: "Diego Salinas",
      telefonoOriginal: "0932109876",
      telefonoNormalizado: "+593932109876",
      correoPrincipal: "diego.salinas@example.com",
    },
    campania: null,
    origen: "NUEVO",
    redSocial: "X",
    etapa: "CITA",
    semaforo: "VERDE",
    puntuacion: 70,
    asesor: null,
    vendedor: { id: "vendedor-1", nombre: "Sandra Molina", rol: "VENDEDOR" },
    slaInicioEn: new Date(Date.now() - 19 * 60 * 60 * 1000).toISOString(),
    ingresadoEn: new Date(Date.now() - 19 * 60 * 60 * 1000).toISOString(),
    cerradoEn: null,
  },
];

function SeccionLeadsTable() {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const onToggleSeleccion = (leadId: string) => {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(leadId)) {
        siguiente.delete(leadId);
      } else {
        siguiente.add(leadId);
      }
      return siguiente;
    });
  };

  const onToggleSeleccionTodos = (marcar: boolean) => {
    setSeleccionados(marcar ? new Set(LEADS_MOCK_STYLEGUIDE.map((lead) => lead.id)) : new Set());
  };

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm opacity-70">
        Kanban descartado (ver nota de la ficha "Bienvenida" de arriba): el módulo de
        leads mantiene <code>LeadsTable.tsx</code> tal cual está en producción, sin cambios de
        columnas ni de estructura. Segunda pasada de diseño (2026-08-27): el recuadro punteado
        genérico del catálogo (mismo <code>--papel</code> del canvas de fondo) hacía que la tabla se
        viera plana, sin ninguna separación real. Ahora se la trata como se vería en la app de
        verdad -- card propia con elevación (sombra suave de una sola capa, borde índigo tenue) +
        header sólido en <code>--indigo</code>, en vez de heredar el mismo papel del fondo. El hover
        de fila queda intacto, ya evaluado y aprobado.
      </p>
      <GrillaCatalogo columnaUnica>
        <ElementoCard
          titulo="Tabla de leads (componente real, vista admin completa)"
          nota={
            <>
              Componente real, no reimplementado: <code>frontend/src/funcionalidades/leads/LeadsTable.tsx</code>{" "}
              (TanStack Table), montado con 8 leads mock (<code>LEADS_MOCK_STYLEGUIDE</code>, este
              archivo) que cubren las 5 etapas, los 4 semáforos (incluido <code>null</code>, "sin
              calificar"), las 5 redes sociales, un <code>origen: "REINGRESO"</code> (badge
              "Reingreso" en Cliente) y un <code>correoPrincipal: null</code> (celda Cliente sin
              subtexto de correo). <code>mostrarColumnaResponsable</code> y{" "}
              <code>permitirSeleccion</code> en <code>true</code> (vista admin): el checkbox de
              selección funciona en vivo con estado local de React (<code>Set&lt;string&gt;</code>
              ), igual que en <code>LeadsPage.tsx</code>. La columna "Estado de SLA" usa{" "}
              <code>SlaCountdownCell</code>/<code>useSlaCountdown</code> reales -- los{" "}
              <code>slaInicioEn</code>/<code>cerradoEn</code> mock están calculados contra la hora
              real para forzar los 4 estados posibles: A tiempo, En riesgo, Atrasado y Cerrado.
              Card real (<code>.leads-table-card</code>, <code>tema-empresarial.css</code>):
              elevación de una sola capa (Fijo, "sombras suaves de una sola capa"), radio + borde
              índigo tenue, <code>overflow-hidden</code> para que el header respete las esquinas
              redondeadas. Header (<code>.tema-empresarial table thead</code>) en{" "}
              <code>--indigo</code> sólido (<code>.chrome-solido</code>, mismo índigo del
              sidebar/header, ningún color nuevo) con texto en <code>--papel</code> -- pasó por el
              gradiente de marca (2026-08-28) y se revirtió el mismo día: la tabla es chrome
              funcional, no un momento "hero", el gradiente ahí quedó reservado solo a
              login/splash. Hover de fila SIN CAMBIOS (tinte índigo sutil + barra
              de acento en <code>--cat-2</code>, <code>.tema-empresarial .leads-table-row</code>) --
              ya evaluado y aprobado, no se tocó. El hover base compartido (
              <code>src/index.css</code>) tampoco.
            </>
          }
          frameBorder={false}
          frameClassName="w-full items-start justify-start p-0"
        >
          <div className="leads-table-card w-full">
            <LeadsTable
              leads={LEADS_MOCK_STYLEGUIDE}
              mostrarColumnaResponsable
              permitirSeleccion
              seleccionados={seleccionados}
              onToggleSeleccion={onToggleSeleccion}
              onToggleSeleccionTodos={onToggleSeleccionTodos}
            />
          </div>
        </ElementoCard>
      </GrillaCatalogo>
    </div>
  );
}
