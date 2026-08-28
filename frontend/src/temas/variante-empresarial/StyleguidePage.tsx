import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
 * Catálogo de referencia (estilo docs de un framework -- Bootstrap/Storybook)
 * de la variante de tema "Propuesta B -- Consejo directivo (empresarial
 * premium)". Código real dentro de `frontend/src/`, no un mock HTML nuevo --
 * demuestra que la dirección visual documentada en
 * `.interface-design/system.md` es realizable con el stack ya instalado
 * (React 19 + Tailwind 3.4 compilado + shadcn/Radix, sin dependencias de
 * animación JS).
 *
 * Finalidad explícita (no es una app funcional montada): presentar en cards
 * cada elemento del tema -- nombre, muestra visual renderizada de verdad, y
 * una nota corta de su función y dónde se usa/usaría en la app real. Cada
 * `ElementoCard` de abajo es una entrada de ese catálogo.
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
        className="tema-empresarial scrollbar-themed h-full space-y-16 overflow-y-auto px-6 py-10"
      >
      {/*
        `index.css` fija `overflow-hidden` en html/body/#root a propósito --
        solo `main` de AppLayout tiene su propio scroll interno (ver ese
        comentario). Esta página no cuelga de AppLayout (es una ruta dev-only
        fuera del árbol protegido), así que necesita su propio contenedor con
        scroll -- sin esto, todo lo que no entra en un viewport queda
        renderizado pero inalcanzable.
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

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-60">
          Catálogo de tema · dev-only
        </p>
        <h1 className="headline text-3xl font-semibold">Propuesta B — Consejo directivo</h1>
        <p className="max-w-2xl text-sm opacity-70">
          Listado de qué componentes conforman este tema y cómo/dónde se aplican -- no una
          instancia funcional de la app. Cada tarjeta es un elemento: nombre, muestra visual
          renderizada de verdad, y una nota de dónde se usa/usaría en la app real. El radio del
          frame de muestra varía a propósito entre secciones -- controles simples más ajustados,
          contenido "vivo" embebido (sidebar, tabla de leads) más suelto -- para no leer como el
          mismo rectángulo repetido de punta a punta.
        </p>
      </header>

      <Seccion numero={1} titulo="Fundaciones">
        <SeccionFundaciones />
      </Seccion>

      <Seccion numero={2} titulo="Fondo del main">
        <SeccionFondoMain />
      </Seccion>

      <Seccion numero={3} titulo="Sidebar / Topbar">
        <SeccionShellReal />
      </Seccion>

      <Seccion numero={4} titulo="Buscadores">
        <SeccionBuscadores />
      </Seccion>

      <Seccion numero={5} titulo="Botones">
        <SeccionBotones />
      </Seccion>

      <Seccion numero={6} titulo="Tabs">
        <SeccionTabs />
      </Seccion>

      <Seccion numero={7} titulo="Selects">
        <SeccionSelects />
      </Seccion>

      <Seccion numero={8} titulo="Chips / Badges">
        <SeccionBadges />
      </Seccion>

      <Seccion numero={9} titulo="Tarjetas">
        <SeccionTarjetas />
      </Seccion>

      <Seccion numero={10} titulo="Estados de carga / vacío / error">
        <SeccionEstados />
      </Seccion>

      <Seccion numero={11} titulo="Loader de bienvenida">
        <SeccionWelcomeSplash />
      </Seccion>

      <Seccion numero={12} titulo="Tabla de leads">
        <SeccionLeadsTable />
      </Seccion>
      </div>
      {/*
        Nodo de portal DEDICADO, hermano de `#tema-empresarial-root` -- NUNCA
        un hijo directo de ese div. `space-y-16` (Tailwind) aplica
        `margin-top: 4rem` a todo hijo que no sea el primero vía el selector
        `> :not([hidden]) ~ :not([hidden])`; un portal montado ahí adentro
        queda atrapado por esa regla y un overlay `fixed inset-0` termina
        corrido 64px hacia abajo (bug real, encontrado con
        `CSS.getMatchedStylesForNode` vía CDP -- no una teoría). Este nodo
        vive fuera de ese flujo pero sigue llevando la clase
        `tema-empresarial` para heredar las variables/selectores scopeados
        de esta variante.
      */}
      <div id="tema-empresarial-portal-root" className="tema-empresarial" />
    </>
  );
}

interface SeccionProps {
  numero: number;
  titulo: string;
  children: ReactNode;
}

function Seccion({ numero, titulo, children }: SeccionProps) {
  return (
    <section className="space-y-4 border-t border-[rgba(30,42,94,0.18)] pt-10 first:border-t-0 first:pt-0">
      <div>
        <p className="tabular text-xs font-semibold opacity-50">{String(numero).padStart(2, "0")}</p>
        <h2 className="headline text-xl font-semibold">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * Entrada individual del catálogo: nombre del elemento + muestra visual
 * renderizada de verdad (no una captura) + nota corta de dónde se usa. Es el
 * bloque repetido en cada sección, al estilo de la documentación de
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
   * secciones (evitar "misma card × N", `interface-design`): `"sm"` para
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
    <Card className={cn("flex flex-col gap-3 border-[rgba(30,42,94,0.18)] bg-white p-4", className)}>
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
        única propuesta de sidebar/topbar de Propuesta B es la de fondo índigo sólido, decisión
        Fijo. Ver <code>.interface-design/system.md</code>, "Propuesta B -- Fijo".
      </p>
      <GrillaCatalogo columnaUnica>
        <ElementoCard
          titulo="Sidebar + Topbar — índigo sólido (nueva propuesta, interactiva)"
          nota={
            <>
              Mockup nuevo (<code>SidebarIndigoPreview.tsx</code>), no el componente real: fondo
              sólido índigo <code>#1E2A5E</code> para sidebar y header -- ya no comparten el fondo
              hueso del canvas. Texto hueso <code>#F5F3EE</code> (100% en el ítem activo, ~65% en
              los inactivos, contraste validado 12.2:1). Ítem activo: pill sólido en el azul de
              acento <code>#2563EB</code> (ya definido como <code>--cat-2</code> de la paleta
              categórica, no un color nuevo) con texto blanco (contraste validado 5.17:1) +{" "}
              <code>ring-1 ring-white/10</code> para distinguirlo del índigo de fondo -- reemplaza
              el borde-izquierdo, que no se lee bien sobre un fondo ya coloreado. Sin borde
              divisorio hacia el canvas: el contraste índigo/hueso ya marca el límite. Reutiliza
              los datos reales de <code>layouts/navigation.ts</code> (mismas etiquetas/rutas/
              íconos), no la implementación visual del sidebar real. Clickeá un ítem: alterna cuál
              se ve activo con estado local de React, sin navegar de verdad.
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

function SeccionBuscadores() {
  return (
    <GrillaCatalogo>
      <Card className="flex flex-col gap-2 border-dashed border-[rgba(30,42,94,0.35)] bg-white p-4">
        <p className="headline text-sm font-semibold">No aplica</p>
        <p className="text-xs leading-relaxed opacity-70">
          Regla de producto fija (`.interface-design/system.md`, "Estructura compartida"): ninguna
          pantalla del CRM tiene buscador libre, en ningún tema. No es un olvido de esta sección --
          el filtrado se resuelve con selects/combos acotados (<code>LeadsFiltros.tsx</code>,{" "}
          <code>ResponsableCombobox.tsx</code>), nunca con un input de búsqueda de texto libre.
        </p>
      </Card>
    </GrillaCatalogo>
  );
}

function SeccionBotones() {
  return (
    <GrillaCatalogo className="sm:grid-cols-3 lg:grid-cols-4">
      <ElementoCard titulo="Primario" nota="Acción principal de una vista (ej. confirmar cierre de venta).">
        <Button style={{ background: "var(--indigo)" }} className="text-white hover:opacity-90">
          Primario
        </Button>
      </ElementoCard>
      <ElementoCard titulo="Secundario (outline)" nota="Acción secundaria junto a un primario (ej. «Cancelar»).">
        <Button variant="outline" className="border-[color:var(--indigo)]/30 text-[color:var(--indigo)]">
          Secundario
        </Button>
      </ElementoCard>
      <ElementoCard titulo="Destructivo" nota="Acciones irreversibles (ej. cerrar lead, desactivar usuario) -- siempre con confirmación explícita.">
        <Button variant="destructive">Destructivo</Button>
      </ElementoCard>
      <ElementoCard titulo="Ghost" nota="Acciones de bajo énfasis dentro de un panel (ej. íconos del header).">
        <Button variant="ghost" className="text-[color:var(--indigo)]">
          Ghost
        </Button>
      </ElementoCard>
      <ElementoCard titulo="Enlace" nota="Navegación en línea con el texto (ej. «Mi perfil» dentro de un párrafo).">
        <Button variant="link" className="text-[color:var(--indigo)]">
          Enlace
        </Button>
      </ElementoCard>
      <ElementoCard titulo="Deshabilitado" nota="Estado inactivo mientras una precondición no se cumple (ej. formulario inválido).">
        <Button disabled>Deshabilitado</Button>
      </ElementoCard>
    </GrillaCatalogo>
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
          <SelectTrigger className="w-56">
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
  const kpis: { titulo: string; valor: string; color: string }[] = [
    { titulo: "Total de leads ingresados", valor: "248", color: "var(--cat-2)" },
    { titulo: "Leads en gestión", valor: "96", color: "var(--cat-3)" },
    { titulo: "Tasa de conversión", valor: "24.6%", color: "var(--cat-1)" },
    { titulo: "Cumplimiento de SLA", valor: "88%", color: "var(--cat-4)" },
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
            <code>.interface-design/system.md</code>.
          </>
        }
        frameRadius="md"
      >
        <div className="grid w-full grid-cols-2 gap-3">
          {kpis.map((kpi) => (
            <Card key={kpi.titulo} variant="accent" accentColor={kpi.color} className="border-[rgba(30,42,94,0.12)] bg-white">
              <CardContent className="p-3">
                <p className="text-[10px] opacity-60">{kpi.titulo}</p>
                <p className="tabular text-xl font-bold" style={{ color: "var(--indigo)" }}>
                  {kpi.valor}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </ElementoCard>
      <ElementoCard
        titulo="Tarjeta genérica"
        nota="`variant=&quot;default&quot;`, sin pestaña -- paneles de gráficos del dashboard."
        frameRadius="md"
      >
        <Card className="w-full border-[rgba(30,42,94,0.18)] bg-white">
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
      <ElementoCard titulo="Vacío" nota="`frontend/src/componentes/states/EmptyState.tsx`, tal cual está.">
        <EmptyState
          className="w-full"
          title="Sin leads en esta vista"
          description="Ajustá los filtros para ver resultados."
        />
      </ElementoCard>
      <ElementoCard
        titulo="Error"
        nota="`frontend/src/componentes/states/ErrorState.tsx`, tal cual está -- mensaje ya traducido, nunca un código HTTP crudo."
      >
        <ErrorState
          className="w-full"
          message="No se pudo cargar el listado de leads. Intentá de nuevo."
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
              su <code>space-y-16</code> le suma <code>margin-top: 4rem</code> a cualquier hijo que
              no sea el primero, corriendo el overlay 64px). Con la posición{" "}
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
            // `#tema-empresarial-root` (su `space-y-16` aplica
            // `margin-top: 4rem` a todo hijo que no sea el primero -- un
            // overlay `fixed inset-0` ahí queda corrido 64px hacia abajo,
            // bug real confirmado con `CSS.getMatchedStylesForNode`/CDP).
            // `position: fixed` sigue cubriendo el viewport completo igual
            // -- nada acá arriba define un containing block nuevo
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
 *   ver `SemaforoBadge` en la sección 08 de arriba).
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
        Kanban descartado (ver nota de la sección "Loader de bienvenida" de arriba): el módulo de
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
              índigo tenue, <code>overflow-hidden</code> para que el header sólido respete las
              esquinas redondeadas. Header (<code>.tema-empresarial table thead</code>) en{" "}
              <code>--indigo</code> sólido (mismo índigo del sidebar/header, ningún color nuevo) con
              texto en <code>--papel</code>. Hover de fila SIN CAMBIOS (tinte índigo sutil + barra
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
