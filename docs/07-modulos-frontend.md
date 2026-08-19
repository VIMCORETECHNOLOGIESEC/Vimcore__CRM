# 07 — Módulos frontend y checklist de avance

React + TypeScript + Tailwind CSS. Web responsive, interfaz exclusivamente en
español.

Línea gráfica, paleta, librerías de UI candidatas y flujo de mockups por
módulo: ver `docs/09-linea-grafica-frontend.md`.

Skills de agente IA instaladas para el desarrollo de este frontend (lista,
instalación y cuándo usar cada una): ver `docs/10-skills-agente-frontend.md`.

---

## Estructura

```
frontend/src/
├── api/            Clientes HTTP y hooks de TanStack Query
├── componentes/    Componentes reutilizables
├── funcionalidades/
│   ├── autenticacion/
│   ├── leads/
│   ├── dashboard/
│   ├── usuarios/
│   ├── bridges/
│   └── notificaciones/
├── layouts/
├── hooks/
├── tipos/          Tipos compartidos con el backend
└── utils/
```

---

## F1 — Base

> **Progreso:** implementado en `configuracion-base-monorepo` (PR1
> `feat/configuracion-base-backend`, PR2 `feat/configuracion-base-frontend`),
> verificado PASS con 2 advertencias no bloqueantes (deriva de pnpm entre
> `onlyBuiltDependencies` y `allowBuilds`; reinstalación completa de pnpm en el
> primer arranque del contenedor). Tailwind fijado en v3 (no v4), para evitar
> el binario nativo `oxide`.

- [x] Vite + React + TypeScript + Tailwind
- [x] Enrutado con React Router y rutas protegidas por rol
- [x] TanStack Query configurado con manejo global de errores
- [x] Cliente HTTP con inyección de JWT y refresco automático ante 401
- [x] Layout principal: barra lateral, encabezado, campana de notificaciones
- [x] Diseño responsive con puntos de corte móvil, tableta y escritorio
- [x] Estados de carga (esqueletos), vacío y error en cada vista
- [x] Paleta base neutra y tipografía legible; sin manual de marca disponible,
      se prioriza claridad y contraste sobre expresividad (línea gráfica
      propuesta en `docs/09-linea-grafica-frontend.md`)

> **F1 completado** (agente frontend, rama `dev-front`). Rutas y layout con
> React Router en modo datos (`createBrowserRouter`, no el modo "framework"
> completo -- ver nota en `frontend/src/router.tsx`), TanStack Query con
> `QueryCache`/`MutationCache` mostrando errores en español vía `sonner`,
> cliente HTTP propio con cola de refresco anti-carrera (rotación de refresh
> tokens en el backend, D-D), shadcn/ui inicializado con la CLI legacy
> `shadcn@3.8.5` (no `@latest`/`@canary`: la 4.x rompe con Tailwind v3, ver
> informe de la tarea) sobre la paleta aprobada de `docs/09` §3.
> **Bloqueante de testing resuelto** (decisión explícita del usuario): se
> instaló Vitest + jsdom + Testing Library (`@testing-library/react`,
> `jest-dom`, `user-event`) como devDependencies de `frontend/`, con
> `vitest.config.ts` (reutiliza el alias `@/*` y el plugin de React de
> `vite.config.ts` vía `mergeConfig`) y script `pnpm --filter frontend test`
> (`vitest run`). La lógica real sin cubrir que motivó el bloqueante ahora
> tiene test unitario (AGENTS.md §5): inyección de JWT, reintento ante 401,
> deduplicación de refrescos concurrentes y sesión expirada en
> `api/httpClient.ts`; mapeo global de errores en `api/queryClient.ts`;
> `hasRoleAccess` en `permissions.ts`; login/logout/estado de sesión/`hasRole`
> en `AuthContext.tsx`; y las redirecciones de `ProtectedRoute.tsx` (sin
> sesión, sin rol permitido, con acceso). 40 tests, 5 archivos, todos en
> verde (`frontend/tests/*.test.{ts,tsx}`).
>
> **Seguimiento post-F1** (rama `dev-front`, tras F8): `layouts/AppLayout.tsx`
> fija `aside` y `Header` fuera del área scrolleable de `main`, con
> scrollbar temática propia (`d93cf7e`). El item de navegación "Panel" pasa
> a mostrarse como "Dashboard" -- la ruta `/panel` y el resto de la lógica
> quedan intactos, solo cambia el texto visible (`989eab9`). Se agrega
> `layouts/PageHeaderContext.tsx` (`PageHeaderProvider` + hooks
> `usePageHeader`/`usePageHeaderValue`, mismo estilo que `AuthContext`) para
> publicar el título de cada pantalla en el Header ahora fijo, con un
> breadcrumb-lite (`ChevronRight` de lucide-react) cuando la página publica
> `backTo` (`7315bd9`). Las 8 rutas migran a `usePageHeader` y se borran los
> `h1`/botón "Volver al listado" locales que quedaban duplicados y
> scrolleaban junto con el contenido (`3938145`). Verificado: `tsc --noEmit`
> sin errores; `pnpm test -- --run` en verde, 35 archivos / 373 tests.

---

## F2 — Autenticación

> **Progreso:** implementado sobre la base de F1 (`AuthContext`, `httpClient`,
> `ProtectedRoute`, `permissions.ts` ya existían con placeholders/estado en
> memoria). TDD real: Vitest + Testing Library, 63/63 tests pasan; `tsc` +
> `vite build` sin errores.
>
> - **Login** (`LoginPage.tsx`): React Hook Form + Zod, importando
>   literalmente `loginBodySchema` desde el paquete compartido
>   `packages/schemas` (ver nota de consolidación más abajo) — ya no es un
>   espejo manual, es el mismo schema que usa
>   `backend/src/schemas/auth.schema.ts`; error accionable vía
>   `getErrorMessage`. Se agregaron dos primitivas UI propias
>   (`components/ui/input.tsx`, `components/ui/label.tsx`) siguiendo el estilo
>   shadcn/zinc/new-york ya usado en el repo, **sin** sumar
>   `@radix-ui/react-label` (dependencia nueva no declarada, AGENTS.md §2.1):
>   `Label` es un `<label>` nativo, `Input` no necesita Radix.
> - **Persistencia de sesión** (`httpClient.ts`): el `refreshToken` se
>   persiste en `localStorage` (`accessToken` sigue solo en memoria, vida
>   corta). Nueva función `restoreSession()` reutiliza la misma cola de
>   deduplicación de refrescos que el interceptor 401. `AuthProvider` la
>   invoca al montar; mientras rehidrata, `ProtectedRoute` muestra "Cargando
>   sesión…" en vez de parpadear a login. Si el refresh persistido ya no es
>   válido, el mismo `onSessionExpired` del interceptor 401 cierra la sesión
>   sola. `user` es estado de servidor (`GET /auth/perfil`) y se maneja con
>   TanStack Query (`useQuery`, key `["auth", "perfil"]`) en
>   `AuthContext.tsx`, conforme a AGENTS.md §4 — sin excepción alguna al
>   estándar. Ver el comentario en `AuthContext.tsx` para el detalle
>   completo del contrato.
> - **Redirección post-login por rol** (`permissions.ts::getLandingRoute`):
>   primer ítem de `NAVIGATION_ITEMS` (barra lateral, ya existente) accesible
>   para el rol del usuario; hoy resuelve `/panel` para los 4 roles porque
>   F3+ todavía no tiene vistas distintas por rol, pero es la única fuente de
>   verdad para cuando las tenga. `LoginPage` respeta además el
>   `location.state.desde` que deja `ProtectedRoute` al redirigir a login
>   desde una ruta específica.
> - **Perfil y cambio de contraseña** (`PerfilPage.tsx`, ruta `/perfil`,
>   protegida para cualquier rol autenticado, enlazada desde el menú de
>   usuario del encabezado): **brecha de backend detectada y documentada, no
>   resuelta en este cambio** (fuera de alcance de este agente, que no toca
>   `backend/**`). El backend no expone un endpoint de autoservicio para
>   cambiar la propia contraseña; el único que toca `password` es
>   `PATCH /usuarios/:id` (`backend/src/routes/usuarios.routes.ts`),
>   protegido con `requireRole("ADMINISTRADOR")` y sin verificar la
>   contraseña actual. El frontend reutiliza ese endpoint pasando el propio
>   `id` (`autenticacion.api.ts::changePasswordApi`, con la decisión
>   documentada en el comentario del código): hoy solo funciona de punta a
>   punta para el rol ADMINISTRADOR; para SUPERVISOR/ASESOR/VENDEDOR el
>   backend responde 403 con mensaje accionable. Se necesita un endpoint
>   propio (p. ej. `PATCH /auth/perfil/password`, exigiendo la contraseña
>   actual) para cerrar esta brecha para el resto de los roles.

> **Nota de consolidación — `packages/schemas` (nuevo paquete pnpm):**
> el hook de pre-commit (Gentleman Guardian Angel, revisor AI contra
> `AGENTS.md`) bloqueó el primer intento de commit de F2 porque
> `LoginPage.tsx` y `PerfilPage.tsx` tenían copias manuales de los schemas
> Zod del backend en vez de reutilizarlos (`AGENTS.md` §4: "Formularios con
> RHF+Zod, reutilizando los esquemas del backend"). Como el workspace no
> tenía ningún paquete compartido entre `backend/` y `frontend/`, se creó
> `packages/schemas/` (agregado a `pnpm-workspace.yaml`, dependencia
> `"schemas": "workspace:*"` en ambos `package.json`) que exporta
> `loginBodySchema` y `passwordPolicySchema` — **solo** lo que ya estaba
> duplicado, no todo `createUsuarioBodySchema`, para no arrastrar
> `@prisma/client` (vía el enum `RolUsuario`) hacia el bundle del frontend.
> `backend/src/schemas/auth.schema.ts` y `usuarios.schema.ts` ahora
> importan de ahí en vez de definir esos dos schemas inline.
>
> **Punto a coordinar en la consolidación con `dev-back`:** este cambio
> tocó archivos de `backend/src/schemas/` y `pnpm-workspace.yaml` desde el
> worktree `dev-front`, mientras el backend se sigue desarrollando en
> paralelo en el worktree `dev-back`. Al mergear ambas ramas, verificar que
> `dev-back` no haya modificado `auth.schema.ts`/`usuarios.schema.ts` de
> forma incompatible con esta extracción, y evaluar si otros schemas que
> `dev-back` agregue mientras tanto (p. ej. de `leads`, cuando F3 se
> conecte al backend real) también deberían vivir en `packages/schemas` en
> vez de crear un mirror nuevo del lado del frontend.

- [x] Pantalla de inicio de sesión
- [x] Persistencia de sesión y cierre automático al expirar el refresh
- [x] Redirección post-login según rol
- [x] Pantalla de perfil con cambio de contraseña (frontend completo; ver
      nota de progreso — funciona de punta a punta solo para ADMINISTRADOR
      hasta que exista un endpoint de backend de autoservicio)

---

## F3 — Listado de leads

Es la pantalla de trabajo diario. Su rendimiento percibido define la experiencia
del producto.

> **Progreso:** implementado contra un **mock en memoria**
> (`funcionalidades/leads/leads.api.ts`), no contra el backend real —
> `GET /api/v1/leads` (M5) y la asignación masiva (M6) todavía no existen ni
> como esqueleto en `docs/06-modulos-backend.md` al momento de este cambio,
> y el backend se sigue desarrollando en paralelo en el worktree `dev-back`.
> El usuario autorizó explícitamente construir F3+ contra datos en memoria
> con la misma forma de función que tendrá la integración real
> (`fetchLeadsApi`, `assignLeadsMasivoApi`), para que conectar el backend
> sea reemplazar el cuerpo de esas dos funciones, no reescribir quien las
> consume (`useLeads.ts`, `LeadsPage.tsx`). Cada punto de integración
> pendiente está marcado con el token `INTEGRACION-BACKEND` (grepeable en
> todo el repo) — buscarlo ahí es el punto de partida para conectar F3 al
> backend real cuando esté disponible. TanStack Query (`useLeads`,
> `keepPreviousData`) para evitar parpadeo entre páginas; TanStack Table
> para el modelo de columnas. Vitest + Testing Library, todos los tests en
> verde; `tsc` + `vite build` sin errores.
>
> **Actualización (cambio SDD `integracion-leads-f3-f4`, portado desde
> `test/integration`):** `fetchLeadsApi`/`assignLeadsMasivoApi` ya llaman al
> backend real (`GET /leads`, `POST /leads/asignar-lote`, un único request
> con reporte por lead). El bloque de arriba queda como registro histórico
> de la decisión original de construir contra mock.
>
> Fuera de alcance de esta implementación: actualización por SSE (depende
> de infraestructura de bridges/tiempo real que todavía no existe, F8) y el
> contrato exacto de query params de `GET /api/v1/leads` (los nombres
> usados en `LeadsQueryParams` son una suposición razonable a validar
> contra la implementación real del backend antes de conectar).
>
> **Actualización (bridge-lifecycle-management, Fase 1, dev-front):** el
> filtro de red social dejó de listar las 5 redes del enum estático
> (`REDES_SOCIALES` local, eliminado) y ahora consume
> `useRedesSocialesActivas()` (`funcionalidades/bridges/useBridges.ts`),
> que solo ofrece las redes con al menos un bridge `ACTIVO` -- ver F8 más
> abajo. Mientras carga, el selector queda deshabilitado con solo la opción
> "Todos"; si el `redSocial` ya elegido deja de estar activo, se mantiene
> como opción renderizada en vez de desaparecer (si no, un filtro aplicado
> se "esfumaría" solo). Test dedicado en `tests/leads/LeadsFiltros.test.tsx`.

> **Actualización (rediseño de la barra de filtros, dev-front):**
> `LeadsFiltros.tsx` reorganiza los filtros avanzados detrás de un botón
> "Filtros" (`SlidersHorizontal`) que abre un `Popover` anclado debajo del
> botón (grid de 2 columnas, `side="bottom"` forzado con
> `avoidCollisions={false}` porque el Header de la app es fijo y voltearlo
> hacia arriba lo cortaría) -- la card principal solo muestra la búsqueda y
> ese botón, con un `Badge` que cuenta los filtros avanzados activos (etapa,
> semáforo, red social, campaña, responsable, estado de SLA, rango de
> fechas; la búsqueda no cuenta para el badge). Debajo, una fila responsiva
> (`flex flex-wrap`) de chips muestra cada campo activo -- incluida la
> búsqueda -- con una "×" para quitarlo individualmente, más un ícono
> `Trash2` que limpia todos los filtros de una vez (`FILTROS_LEADS_VACIOS`);
> la lista de chips se construye iterando una sola vez el conjunto fijo de
> campos (`leads.utils.ts::buildFiltrosActivos`), así que nunca hay más de
> un chip por campo. El filtro de Responsable pasó de `<Select>` a un
> combobox buscable (`Popover` + `Command` de shadcn, componentes agregados
> en este cambio junto con la dependencia nueva `cmdk`) que filtra por
> nombre y muestra un máximo de 5 coincidencias, con "Todos los
> responsables" fijo como primera opción -- vive anidado dentro del
> `Popover` de filtros, y Radix maneja ese anidamiento sin conflictos
> (abrir/cerrar el combobox interno no afecta al popover padre). Test
> dedicado actualizado en `tests/leads/LeadsFiltros.test.tsx` (incluye abrir
> el Popover antes de interactuar con los campos, el tope de 5 del combobox
> y los chips); se agregó también un polyfill de `ResizeObserver` en
> `tests/setup.ts` (jsdom no lo implementa y `cmdk` lo necesita). `tsc
> --noEmit` y `vite build` sin errores.

- [x] Tabla con columnas: cliente, teléfono, red social, campaña, etapa,
      semáforo, responsable, estado de SLA, fecha de ingreso
- [x] Indicador de semáforo con color **y** etiqueta de texto
- [x] Contador de SLA en vivo con formato `HH:MM:SS`, actualizado en cliente
- [x] Distintivo visual para leads de reingreso
- [x] Filtros combinables: etapa, semáforo, red social, campaña, responsable,
      rango de fechas, estado de SLA
- [x] Búsqueda por nombre, teléfono o correo
- [x] Paginación del lado del servidor (simulada en el mock; real cuando
      exista `GET /api/v1/leads`)
- [x] Vista adaptada por rol: asesor y vendedor ven solo su cartera, sin columna
      de responsable
- [x] Acciones masivas de asignación para supervisor y administrador
- [ ] Actualización por SSE cuando ingresa un lead nuevo (pendiente,
      depende de infraestructura de bridges/tiempo real — F8)
- [ ] Tabs "Pendientes/En proceso" (vista por defecto) vs "Cerrados"
      (2026-08-19, diseño): la vista principal de la tabla — la que hoy
      existe sin distinción — pasa a filtrar por defecto `etapa NOT IN
      (VENTA, NO_VENTA)` (mapea al nuevo parámetro `vista=activos` de
      `GET /api/v1/leads`, ver `docs/06-modulos-backend.md` M5). Un segundo
      tab "Cerrados" (`vista=cerrados`) muestra solo Venta/No Venta, con un
      control adicional dentro de ese tab para acotar a una de las dos
      (reusa el filtro `etapa` ya existente, restringido a esas dos opciones
      mientras el tab está activo — el resto de filtros combinables sigue
      disponible igual en ambos tabs). Cambiar de tab resetea la página a 1
      (mismo criterio que ya aplica cualquier cambio de filtro) pero
      conserva el resto de filtros activos.
      **Nota de diseño a confirmar al implementar:** el filtro de rango de
      fechas hoy filtra por `ingresadoEn` (`fechaDesde`/`fechaHasta` →
      `desde`/`hasta` del backend). El dashboard (`docs/08-dashboard-kpis.md`
      §2.3) ya estableció la convención "los cerrados se cuentan por fecha
      de **cierre**, los ingresados por fecha de **ingreso**" — por
      consistencia, el tab "Cerrados" debería filtrar ese mismo rango contra
      `cerradoEn`, no `ingresadoEn`, mientras el tab "Pendientes" sigue
      usando `ingresadoEn` como hoy. El backend actual (`listLeadsQuerySchema`)
      no distingue el campo de fecha por `vista` — si se confirma este
      criterio, hace falta agregarlo al mismo cambio de M5 de arriba, no
      inventarlo solo del lado del frontend.

> El contador de SLA se calcula en el cliente a partir de la marca de tiempo
> recibida. No consultes al servidor cada segundo: a 100 concurrentes eso son
> 100 peticiones por segundo para mostrar un reloj.

---

## F4 — Detalle del lead

Muestra el **estado actual** con su formulario, no un timeline de interacciones.

> **Progreso:** implementado contra un **mock en memoria**
> (`funcionalidades/leads/detalle/leadDetalle.api.ts`), igual que F3 — M6/M7
> (`docs/06-modulos-backend.md`) no existen todavía ni como esqueleto: no hay
> endpoint de detalle de lead, formulario/puntuación/semáforo, citas ni
> cierre, tampoco modelos Prisma para nada de eso. Comparte el fixture
> mutable `LEADS_MOCK` con `leads.api.ts` (F3) para que listado y detalle
> queden consistentes en una misma sesión. Cada punto de integración
> pendiente está marcado con el token `INTEGRACION-BACKEND`.
>
> **Actualización (cambio SDD `integracion-leads-f3-f4`, portado desde
> `test/integration`):** `leadDetalle.api.ts` ya llama al backend real
> (`GET /leads/:id`, `PATCH /leads/:id/etapa` colapsando
> formulario/cierre-venta/cierre-no-venta, endpoints reales de `M7 Citas`,
> `POST /citas/:citaId/cancelar` dedicado separado de marcar resultado).
> `LEADS_MOCK` sigue existiendo solo por F5/F6, que no son parte de este
> cambio. El bloque de arriba queda como registro histórico.
>
> **Decisiones de diseño propias del frontend** (no fijadas por ningún
> contrato de backend, documentadas para que quien conecte el backend real
> las revise):
> - **Preguntas/opciones de los 3 formularios calificables**
>   (`formulariosEtapa.ts`): los pesos por pregunta y por etapa (NUEVO=11,
>   CONTACTADO=13, CITA=14) sí vienen de docs/02; el *contenido* de cada
>   pregunta y sus opciones (mayormente "Sí"=10 / "Parcial"=5 / "No"=0, con
>   excepciones puntuales donde el sentido de la pregunta pedía otra escala)
>   es una propuesta de diseño razonable, no un catálogo ya fijado.
> - **Fórmula de puntuación**: una pregunta sin responder cuenta en el
>   denominador (peso máximo posible) pero no aporta al numerador — así un
>   formulario incompleto puntúa más bajo en vez de ignorarse la pregunta
>   como si no existiera. Cubierto con tests de varios casos.
> - **Traspaso sin elegir vendedor** (asesor): se simula el "algoritmo de
>   menor carga" documentado asignando el primer vendedor del catálogo — es
>   una simplificación explícita del mock, el balanceo real es
>   responsabilidad de M6/M7.
> - **Guards de reasignación/traspaso** (`leadDetalle.guards.ts`) son de
>   **UX únicamente** (ocultan/deshabilitan botones): la autorización real
>   sigue siendo responsabilidad del backend cuando exista.
> - **Correos múltiples**: se agregó `ClienteLead.correosSecundarios?`
>   (opcional) en vez de remodelar `correoPrincipal`, para no romper el uso
>   ya existente en F3 (`LeadsTable.tsx`, `leads.api.ts` y sus tests).
> - **Campos nuevos de `Lead`/`ClienteLead`** (`telefonoValido`,
>   `correosSecundarios`, `cuentaPublicitaria`, `camposDinamicos`, campos de
>   cierre) se agregaron **opcionales** deliberadamente, para no forzar
>   cambios en los fixtures/tests de F3 ya commiteados.
> - Se agregaron `components/ui/dialog.tsx` (wrapper de
>   `@radix-ui/react-dialog`, ya instalado — mismo primitivo que usa
>   `sheet.tsx`) y `componentes/ConfirmDialog.tsx` para la confirmación
>   explícita de cierre (irreversible), y `components/ui/textarea.tsx`. No
>   se agregó ninguna dependencia nueva.
> - `LeadsTable.tsx`: el nombre del cliente ahora es un `Link` a
>   `/leads/:id`. Esto requirió envolver `renderLeadsPage()` en
>   `tests/leads/LeadsPage.test.tsx` con `<MemoryRouter>` (cambio mecánico
>   mínimo en el arnés de test, sin tocar aserciones existentes) porque
>   `Link` necesita contexto de Router para renderizar.
>
> TDD: Vitest, 60 tests nuevos (167 en total en el frontend) cubriendo la
> fórmula de puntuación, los rangos de semáforo, los guards de
> traspaso/reasignación, "sin formulario no hay transición", las citas y las
> validaciones Zod de cierre. `tsc` + `vite build` sin errores.
>
> Fuera de alcance: conexión real a M6/M7 (no existen), y el contrato exacto
> de los futuros endpoints (nombres de parámetros/rutas son una suposición
> razonable a validar contra la implementación real).
>
> **Ambigüedades reales a confirmar por un humano antes de M6/M7** (no
> resueltas por suposición, señaladas para no perderse en la consolidación):
> - `canReassignLead` permite a administrador/supervisor reasignar un lead en
>   etapa terminal (VENTA/NO_VENTA) porque `docs/02` dice literalmente
>   "reasignan cualquiera sin condición" — pero reasignar un lead ya cerrado
>   es semánticamente raro. Implementado literal a la regla escrita; a
>   confirmar si el backend real (M6) debería excluir etapas terminales.
> - La `puntuacion` que ya traían los leads de ejemplo en etapa VENTA/NO_VENTA
>   (heredada del fixture de F3) no se recalcula al pasar por
>   `submitCierreVentaApi`/`submitCierreNoVentaApi`, aunque `docs/02` dice que
>   esas etapas "no tienen puntuación". No se fijó a `0`/`null` automáticamente
>   para no inventar una regla no pedida — a decidir el criterio correcto
>   (¿se conserva el último valor calificado, se limpia, se oculta en UI?).

> **Actualización (reversibilidad de etapas + rediseño a timeline,
> dev-front):** `docs/02-reglas-negocio.md` §6 decía "el orden es sugerido,
> no obligatorio... avanzar, saltar y retroceder libremente" y
> `LeadDetallePage.tsx` era fiel a esa regla con un `<Select>` de 5 opciones
> sin ningún guard. Regla nueva: progreso **lineal hacia adelante** entre
> etapas no terminales (Nuevo → Contactado → Cita, nunca se retrocede), con
> salto directo a cierre (Venta/No Venta) desde cualquier etapa no terminal
> -- terminal sigue sin reabrirse, eso no cambió. Whitelist única en
> `funcionalidades/leads/etapas.ts::getTransicionesValidas` (antes
> `ETAPAS_TERMINALES` vivía duplicada en `leads.api.ts` y
> `detalle/leadDetalle.guards.ts`, unificada acá). El `<Select>` libre se
> reemplazó por `detalle/LeadTimeline.tsx`: línea de tiempo vertical con
> nodos Nuevo/Contactado/Cita agendada (punto + conector, negro `#111113`
> como acento estructural, sin panel sólido grande, docs/09 §3), estado
> completado/actual/pendiente por nodo, el formulario de la etapa vigente
> expandido bajo el nodo actual (el destino ya no lo elige el usuario, lo
> calcula el propio timeline como el siguiente paso lineal), y una barra de
> acción persistente ("Cerrar como venta"/"Cerrar como no venta") fuera de
> la timeline, visible en cualquier etapa no terminal y oculta por completo
> en etapa terminal -- reutiliza `CierreVentaForm`/`CierreNoVentaForm` tal
> cual, con su propio `ConfirmDialog`, sin duplicar esa confirmación. El
> mock (`leadDetalle.api.ts`) no tiene historial de transición por etapa
> (`lead_eventos` no está expuesto por `GET /api/v1/leads/:id`, M5): los
> nodos completados que no son "Nuevo" muestran "Fecha no disponible" en vez
> de inventar una fecha (`INTEGRACION-BACKEND` en `LeadTimeline.tsx`); el
> nodo "Nuevo" sí usa `lead.ingresadoEn` (existe en el modelo), y el nodo de
> cierre en etapa terminal usa `lead.cerradoEn`. Tests nuevos:
> `tests/leads/etapas.test.ts` (las 5 ramas de `getTransicionesValidas`) y
> `tests/leads/detalle/LeadTimeline.test.tsx` (ningún control ofrece una
> etapa anterior como destino, la barra de cierre desaparece en etapa
> terminal, fechas presentes/ausentes según corresponda); se actualizó
> también un test de `leadDetalle.api.test.ts` que documentaba la regla
> vieja ("permite... retroceder libremente") para dejar explícito que esa
> capa de mock no aplica la whitelist por sí misma (guard de UX, igual
> criterio que `leadDetalle.guards.ts`). `tsc --noEmit` y `vitest run` sin
> errores (409 tests en verde).

> **Actualización (combobox de responsable reutilizable, dev-front):** el
> combobox buscable con tope de coincidencias que F3 introdujo para el
> filtro de Responsable (`LeadsFiltros.tsx`) vivía como una función local no
> reutilizable. Se extrajo a `funcionalidades/leads/ResponsableCombobox.tsx`
> (Popover + Command de shadcn/cmdk, mismo comportamiento de búsqueda y
> accesibilidad), parametrizado: la opción fija "Todos" es opcional
> (`mostrarOpcionTodos`, con textos independientes para el botón y para la
> opción de la lista -- el botón dice "Todos", la opción de lista dice "Todos
> los responsables", igual que antes) y el tope de coincidencias es
> configurable (`maxResultados`, sigue en 5 por defecto). `LeadsFiltros.tsx`
> ahora consume el componente extraído sin cambiar su comportamiento. Los dos
> `<Select>` planos de `detalle/AccionesResponsable.tsx` (elegir vendedor al
> traspasar, elegir responsable al reasignar) pasan a usar el mismo
> combobox, sin la opción "Todos" -- lógica de guards (`canHandoffToVendedor`,
> `canReassignLead`) y hooks (`useHandoffToVendedor`, `useReassignLead`) sin
> tocar. De paso, corrección de comportamiento real (no solo refactor de UI):
> `getCatalogoResponsables()` (`leads.api.ts`) ahora acepta un parámetro
> `listado: "TODOS" | "ASESORES" | "VENDEDORES"` (`ListadoResponsables`,
> `"TODOS"` por defecto -- los llamadores existentes en `LeadsPage.tsx` y
> `DashboardPage.tsx` pasan `"TODOS"` explícito y no cambian de
> comportamiento). El combobox de "Reasignar" en `AccionesResponsable.tsx`
> pasa a llamar `getCatalogoResponsables("ASESORES")` en vez de la lista
> combinada de asesores+vendedores que usaba antes -- alineado con el
> criterio real del botón (el responsable que se reasigna ahí es el del
> primer contacto, no el del proceso de venta); `aria-label` y placeholder
> se actualizaron de "Nuevo responsable"/"Elegir responsable…" a "Nuevo
> asesor"/"Elegir asesor…" para que el texto no mienta sobre el universo de
> búsqueda. El combobox de "Traspasar a vendedor" ya restringía a
> `VENDEDORES` antes del refactor (`getCatalogoVendedores()`), ahora
> reescrito como atajo de `getCatalogoResponsables("VENDEDORES")` -- sin
> cambio de comportamiento ahí. `getCatalogoResponsables()` sin argumento
> (dashboard F5, tabla de leads F3) sigue devolviendo la lista combinada,
> sin cambios. Riesgo relacionado documentado como R6 en
> `01-alcance-mvp.md` y ampliado en `02-reglas-negocio.md` §5: si se
> aprueba a futuro que una misma persona sea asesor y vendedor
> (`rolSecundario`), `"VENDEDORES"` tendría que resolver contra el rol
> *efectivo*, no solo `rol` -- diseño evaluado, no implementado, pendiente
> de validar con el cliente antes de M6. `tsc --noEmit` limpio para los
> archivos tocados; `vitest run` no
> pudo ejecutarse en este worktree (`node_modules/vitest/vitest.mjs` no se
> resuelve pese a que el paquete figura instalado -- mismo síntoma que
> `@radix-ui/*`, aparenta ser un problema de symlinks del store de pnpm en
> este worktree puntual, no algo introducido por este cambio); se verificó a
> mano que el nuevo componente reproduce exactamente las aserciones de
> `tests/leads/LeadsFiltros.test.tsx`.

- [x] Encabezado: nombre, semáforo, etapa, responsable, contador de SLA
- [x] Datos de contacto: teléfono, correos asociados, marca de dato inválido
- [x] Origen: red social, campaña, cuenta publicitaria, fecha de ingreso
- [x] Campos dinámicos del formulario de la campaña
- [x] Formulario de la etapa vigente con cálculo de puntuación
- [x] Guía de acción según el color del semáforo
- [x] Timeline de progreso de etapa (lineal hacia adelante) con acción
      persistente de cierre directo a Venta/No Venta
- [x] Acción de traspaso a vendedor (asesor, desde etapa Contactado)
- [x] Acción de reasignación con la regla de semáforo aplicada
- [x] Panel de citas: agendar, reprogramar, marcar resultado
- [x] Campos de cierre para Venta y No Venta con validación
- [ ] Guard local de edición (`canEdit`) en `LeadTimeline`/`FormularioEtapaLead`
      y en los botones "Cerrar como venta/no venta" (2026-08-19, gap
      verificado leyendo el código, no solo analizado en abstracto):
      `AccionesResponsable.tsx` sí tiene guards de UX
      (`canHandoffToVendedor`/`canReassignLead`, `leadDetalle.guards.ts`) y
      correctamente desaparecen tras un traspaso/reasignación exitosos (la
      mutación invalida `lead-detalle` y el componente recalcula contra el
      lead fresco). Pero `LeadTimeline`/`FormularioEtapaLead` **no reciben
      `user` y no tienen ningún guard** — después de que un asesor traspasa
      su lead a un vendedor (D4: conserva lectura, pierde edición), el
      formulario de etapa y los botones de cierre siguen mostrándose como si
      pudiera editar. Un envío se rechaza recién en el backend (403) con un
      toast de error genérico, sin explicar la causa. Agregar un
      `canEditLead(lead, user)` local (mismo criterio que
      `leads.access.ts::canEdit` del backend: responsable operativo =
      `vendedorId ?? asesorId`) que oculte esos controles y muestre un
      mensaje explicativo en su lugar (ej. "Este lead ya no está bajo tu
      responsabilidad — fue traspasado/reasignado a &lt;nombre&gt;."), no
      solo los oculte en silencio.
- [ ] Actualización en vivo del detalle abierto ante cambios de otro usuario
      (2026-08-19, depende del módulo SSE compartido de F8/tiempo real):
      hoy, si otro usuario (admin, o el nuevo responsable) cambia la etapa o
      reasigna el lead que este usuario tiene abierto en `LeadDetallePage`,
      nada se actualiza hasta un refresh manual (`staleTime: 30_000` sin
      `refetchOnWindowFocus`, confirmado en `api/queryClient.ts`). Cuando
      exista el cliente SSE genérico, suscribir `[lead-detalle, leadId]` a
      `lead.etapa-cambiada`/eventos de reasignación que mencionen este
      `leadId` puntual e invalidar esa query — mismo criterio que ya usan
      las mutaciones propias del usuario, aplicado también a cambios
      ajenos.
- [ ] Redirección a la tabla de leads si se pierde el acceso de lectura
      (2026-08-19, gap verificado): `canRead` en el backend es más amplio
      que `canEdit` (D4: el asesor que traspasó conserva lectura), así que
      un usuario solo pierde lectura completa por una REASIGNACIÓN real (no
      un traspaso) que lo reemplaza como responsable. Si eso pasa mientras
      tiene la página abierta, `GET /leads/:id` responde 403 y hoy
      `LeadDetallePage.tsx` muestra el `ErrorState` genérico con un botón
      "Reintentar" que vuelve a fallar siempre (`getErrorMessage` no
      distingue código de error). Cuando el código de `ApiError` sea
      `permiso_denegado`, navegar automáticamente a `/leads` con un toast
      explicativo ("Ya no tenés acceso a este lead — fue reasignado a otra
      persona") en vez de dejarlo atascado en un botón de reintento que
      nunca funciona.

---

## F5 — Dashboard

> **Progreso:** implementado contra un **mock en memoria**
> (`funcionalidades/dashboard/metricas.api.ts`), reutilizando el mismo
> fixture `LEADS_MOCK` compartido con F3/F4 (`leads.api.ts`) — M9
> (`docs/06-modulos-backend.md`) no existe todavía ni como esqueleto:
> ninguno de los siete endpoints `GET /api/v1/metricas/*` está implementado.
> La lógica de agregación real y testeada vive en `metricas.utils.ts`
> (funciones puras `calculate*`, con fixtures propios y deterministas en
> `tests/dashboard/metricas.utils.test.ts`, separada de la capa mock
> siguiendo el mismo criterio que `leads.utils.ts`/`leads.api.ts`). Cada
> punto de integración pendiente está marcado con el token
> `INTEGRACION-BACKEND`.
>
> **Simplificaciones del mock frente a `docs/08-dashboard-kpis.md`** (no hay
> tabla `lead_eventos` en el fixture — simularla con event-sourcing completo
> sería sobre-ingeniería para un mock):
> - **Tiempo promedio de primera respuesta** (§2.5) y **cumplimiento de SLA**
>   (§2.7): se aproximan con `slaInicioEn - ingresadoEn` (el reloj de SLA
>   arranca en la asignación, `leadDetalle.api.ts`) para leads que ya
>   salieron de NUEVO, en vez de `lead_eventos.ASIGNACION`/`CAMBIO_ETAPA`
>   reales. El cálculo real es responsabilidad de M9.
> - **Embudo por etapa** (§3.3): cada paso cuenta los leads *actualmente* en
>   esa etapa dentro del rango (foto del pipeline), no el acumulado
>   histórico de leads que alguna vez pasaron por ella — eso también
>   requeriría `lead_eventos.CAMBIO_ETAPA`. Con el fixture de F3 el
>   resultado igual es decreciente, pero no está garantizado con datos
>   reales del mock.
> - **Leads por campaña** (§3.4): se agrupa por `(campaniaId, redSocial)`
>   armado en el momento de agregar, porque `CampaniaLead` (docs/03) no trae
>   su propia red social — vive en el lead.
> - **Leads por asesor** (§3.2): agrupa por **responsable operativo vigente**
>   (`getResponsable`, ya usado en F3/F4: vendedor si hubo traspaso, si no el
>   asesor), no por el campo `asesor` crudo del lead. Un lead traspasado
>   aparece bajo el vendedor, no bajo el asesor que lo originó — consistente
>   con cómo F3/F4 ya muestran "responsable" en tabla y detalle, pero a
>   confirmar si para este KPI específico se prefiere atribución al asesor
>   original en vez del responsable vigente.
>
> **Paleta:** ya cerrada y validada en `docs/09-linea-grafica-frontend.md`
> (categórica de 5 colores en orden fijo para redes sociales/series, y la de
> semáforo reutilizando los mismos hex que `SemaforoBadge.tsx`), definida
> una única vez en `funcionalidades/dashboard/paleta.ts` y reutilizada por
> los 6 gráficos.
>
> Sin componente de embudo nativo en Recharts: `GraficoEmbudo.tsx` se armó
> con un `BarChart` horizontal decreciente con el % de caída como texto,
> no un layout de embudo real — cumple igual la regla de "No Venta se
> muestra aparte, nunca como paso del embudo".
>
> TDD: Vitest, 46 tests nuevos (213 en total en el frontend) cubriendo las
> fórmulas de tasa de conversión, tiempos promedio, cumplimiento de SLA, la
> regla de "período anterior con menos de 10 leads → valores absolutos" y el
> alcance por rol. `tsc` + `vite build` sin errores.
>
> Fuera de alcance: conexión real a M9 (no existe) y la actualización en
> tiempo real por SSE (docs/08 §5) -- mismo criterio que el comentario
> `INTEGRACION-BACKEND` ya dejado en `LeadsPage.tsx` (F3).
>
> **Actualización (integración contra backend real de métricas, dev-front):**
> `metricas.api.ts` reemplaza el cálculo client-side sobre `LEADS_MOCK` por
> los siete endpoints reales `GET /api/v1/metricas/*`. `metricas.utils.ts`
> (las funciones puras `calculate*`) y su suite
> `tests/dashboard/metricas.utils.test.ts` se eliminan por completo: esa
> lógica de agregación ahora vive en el backend. Dos hallazgos frente a lo
> asumido en el mock: `/por-etapa` y `/embudo` son endpoints distintos y no
> relacionados -- `/por-etapa` es un conteo plano por etapa, `/embudo` trae
> el orden de etapas con el % de caída ya calculado, antes se asumía que
> ambos salían de la misma agregación. `distribucionSemaforo` (§3.6) viene
> plegado dentro de `/resumen`, sin endpoint propio. La comparativa contra
> el período anterior en las siete tarjetas de resumen también la resuelve
> el backend, por lo que no queda lógica de agregación ni de comparación de
> períodos del lado del frontend. La actualización en tiempo real por SSE
> sigue fuera de esta rebanada (módulo aparte ya documentado arriba).

- [x] Tarjetas de resumen: total de leads, en gestión, cerrados, tasa de
      conversión, tiempo promedio de primera respuesta, tiempo promedio de cierre
      (se agregó también cumplimiento de SLA, séptimo indicador de
      `docs/08-dashboard-kpis.md` §2 no listado en este ítem del checklist)
- [x] Gráfica de barras: leads por red social
- [x] Gráfica de barras: leads por asesor
- [x] Gráfica de embudo: leads por etapa
- [x] Gráfica de barras: leads por campaña
- [x] Gráfica de barras apiladas: red social × semáforo (la que responde de qué
      red llegan los leads con más probabilidad de cierre)
- [x] Gráfica de anillo: distribución por semáforo, solo leads en gestión
      (ítem no listado en este checklist pero explícitamente requerido por
      `docs/08-dashboard-kpis.md` §3.6 -- se agrega acá para no dejar la
      gráfica sin registro de progreso)
- [x] Selector de rango de fechas con comparativa contra el período anterior
- [x] Alcance por rol: general para administrador y supervisor, personal para
      asesor y vendedor
- [ ] Actualización en tiempo real vía SSE (pendiente, depende de M9 y de
      infraestructura de tiempo real — F8)

**Biblioteca de gráficas:** Recharts. Es declarativa, tipada, y su tamaño de
paquete es razonable para el volumen de gráficas de este dashboard.

---

## F6 — Notificaciones

> **Progreso:** el listado y el marcado (individual/masivo) llaman al
> **backend real** (`funcionalidades/notificaciones/notificaciones.api.ts`),
> confirmado contra `backend/src/routes/notificaciones.routes.ts` y
> `notificaciones.controller.ts` (worktree `dev-back`): `GET /notificaciones`
> (con `soloNoLeidas` como query param opcional), `PATCH
> /notificaciones/:id/leer` y `PATCH /notificaciones/leer-todas`, los tres
> `204` sin cuerpo salvo el `GET`. Reemplaza el mock en memoria con siembra
> perezosa por usuario que usaba este archivo hasta esta integración. El
> canal SSE `GET /api/v1/eventos` sigue sin implementar -- ver los ítems sin
> marcar más abajo, es un módulo aparte.
>
> **`usuarioId` desapareció como parámetro** de las tres funciones y de
> `useNotificaciones.ts`: el backend lo resuelve del JWT
> (`assertAuthenticated`) en las tres rutas (`requireAuthentication`, sin
> restricción de rol), mismo criterio que `LeadsContextoRol` al desaparecer
> de `leads.api.ts` (F3/F4). `useNotificaciones`/`useMarkNotificacionLeida`/
> `useMarkAllNotificacionesLeidas` ya no dependen de `useAuth()` --
> `CampanaNotificaciones` solo se monta detrás de `ProtectedRoute`.
>
> **`TipoNotificacion` (`tipos/notificacion.ts`) corregido contra el enum
> real de Prisma:** el enum real trae 8 valores, uno más que la propuesta
> original de docs/02-reglas-negocio.md §8 -- `INTERACCION_REPETIDA`, sin
> equivalente en la lista original. Se agregó al union y a
> `TIPO_NOTIFICACION_ETIQUETAS` (`catalogos.ts`).
>
> Verificado con `curl` contra el backend real (`docker compose up backend
> db` en `dev-back`, usuario de prueba creado y eliminado con `prisma`
> directo): `GET /notificaciones` y `?soloNoLeidas=true` devuelven `{
> notificaciones }`; `PATCH /notificaciones/:id/leer` y `PATCH
> /notificaciones/leer-todas` devuelven `204` y el `GET` posterior confirma
> `leidaEn` seteado en ambas notificaciones.
>
> TDD: Vitest, `notificaciones.api.test.ts` reescrito para mockear
> `httpClient` (mismo patrón que `bridges.api.test.ts`) en vez del fixture en
> memoria; `CampanaNotificaciones.test.tsx` ajustado (sin mock de
> `AuthContext`, aserciones sin `usuarioId`). `pnpm --filter frontend test`:
> 407 tests en verde. `tsc` + `vite build` sin errores.

- [x] Campana con contador de no leídas
- [x] Panel desplegable con listado y navegación al lead relacionado
- [x] Marcar como leída, individual y masivo
- [ ] Aviso emergente al llegar una notificación por SSE (pendiente, depende
      del canal SSE real -- M8, docs/06-modulos-backend.md)
- [ ] Indicador de reconexión cuando el canal SSE se interrumpe (pendiente,
      mismo motivo)

---

## F7 — Administración de usuarios

Solo administrador.

> **Progreso:** a diferencia de F3-F6, el backend real de usuarios **ya
> existía y estaba mergeado** en este worktree antes de empezar --
> confirmado leyendo `backend/src/routes/usuarios.routes.ts`,
> `usuarios.controller.ts` y `usuarios.service.ts`: los 5 endpoints CRUD
> (`POST/GET/GET:id/PATCH:id/DELETE:id /usuarios`), todos
> `requireRole("ADMINISTRADOR")`. Listado, alta, edición, restablecimiento
> de contraseña y baja lógica (`funcionalidades/usuarios/usuarios.api.ts`)
> llaman a ese backend real, no a un mock. TDD real: Vitest + Testing
> Library, 29 tests nuevos (269 en total en el frontend); `tsc` + `vite
> build` sin errores.
>
> **Brecha de backend detectada y documentada, no resuelta en este
> cambio** (fuera de alcance de este agente, que no toca `backend/**`): no
> existe ningún backend real de leads. Se verificó explícitamente antes de
> escribir código -- `backend/src/{routes,controllers,services}` solo tiene
> archivos de `usuarios`, `auth`, `salud` y `deduplicacion`; M5
> (`docs/06-modulos-backend.md`) no está implementado ni siquiera como
> esqueleto. Eso afecta a dos de los cuatro ítems del checklist:
> - **"Listado con... carga activa de leads"**: no hay forma de consultar
>   la cartera de un usuario real contra un backend real hoy.
> - **"Baja lógica con reasignación obligatoria de la cartera activa"**:
>   se leyó `backend/src/repositories/usuario.repository.ts::deactivateUser`
>   línea por línea para confirmarlo -- la transacción real solo hace
>   `activo=false` + `revokeAllForUser` (revoca todos los refresh tokens),
>   **no reasigna ningún lead**. No hay ningún parámetro de reasignación en
>   `DELETE /usuarios/:id` ni en `usuarios.service.ts::deactivateUser`.
>
> En vez de dejar esos dos ítems sin construir, se reutilizó el mismo
> fixture en memoria que ya usan F3/F4/F5 (`leads.api.ts::LEADS_MOCK`, vía
> las funciones nuevas `getLeadsActivosDeUsuario` ahí, y
> `getCargaActivaDeUsuario`/`getCandidatosReasignacion`/
> `reassignCarteraActiva` en `usuarios.api.ts`) -- para no inventar un
> segundo mock paralelo, y para que la UI completa (listado con conteo,
> diálogo de baja con reasignación forzada cuando corresponde) ya esté
> lista y probada para cuando exista el backend real de leads. Consecuencia
> importante a tener presente: ese mock usa ids sintéticos fijos
> (`asesor-1`, `asesor-2`, `vendedor-1`, `vendedor-2`), no los UUID que
> genera el backend real de usuarios -- en un ambiente real, salvo
> coincidencia, cualquier usuario mostrará "0 leads activos" no porque no
> tenga cartera, sino porque no hay ningún dato real contra el cual
> contarla. Documentado en detalle en el comentario de cabecera de
> `usuarios.api.ts`.
>
> **Restablecimiento de contraseña, sin brecha** (a diferencia de F2): el
> mismo endpoint `PATCH /usuarios/:id` que F2 reutiliza para el
> autoservicio (con la brecha ahí documentada, sigue sin resolverse) acá
> **sí funciona de punta a punta para cualquier usuario objetivo**, porque
> un administrador no necesita la contraseña actual del usuario que está
> reseteando (`usuarios.service.ts::updateUser`, sin verificación de
> contraseña previa) -- es justamente el flujo para el que ese endpoint fue
> diseñado.
>
> **Decisiones de diseño propias del frontend** (no fijadas por ningún
> contrato de backend):
> - Alta y edición son dos diálogos separados (`CrearUsuarioDialog`,
>   `EditarUsuarioDialog`) en vez de uno genérico con dos modos: alta pide
>   contraseña inicial, edición no -- evita la gimnasia de tipos de un
>   formulario RHF+Zod con un modo condicional, a costa de una pequeña
>   duplicación de los campos nombre/correo/rol. Restablecer contraseña es
>   un tercer diálogo aparte (`RestablecerPasswordDialog`), reflejando que
>   el checklist ya los separa en dos ítems distintos.
> - Sin schema compartido de `packages/schemas` para el cuerpo completo de
>   alta/edición: `createUsuarioBodySchema`
>   (`backend/src/schemas/usuarios.schema.ts`) usa `z.enum(RolUsuario)`
>   sobre el enum nativo de Prisma -- importarlo arrastraría
>   `@prisma/client` al bundle del frontend (misma decisión ya tomada en la
>   nota de consolidación de F2). Sí se reutiliza `passwordPolicySchema`
>   para la contraseña inicial y el restablecimiento.
> - `ROLES_USUARIO` (`tipos/usuario.ts`) pasó de `readonly RolUsuario[]` a
>   `as const satisfies readonly RolUsuario[]` para poder alimentar
>   `z.enum(ROLES_USUARIO)` sin duplicar la lista de roles en un segundo
>   lugar -- cambio mecánico, no afecta a ningún uso existente (F1-F6).
> - "Carga activa de leads" cuenta por **responsable operativo vigente**
>   (`getResponsable()`: vendedor si hubo traspaso, si no el asesor), mismo
>   criterio que F5 usa para "leads por asesor" -- un lead traspasado cuenta
>   para el vendedor que lo recibió, no para el asesor original.
>   Administrador/supervisor muestran "No aplica" (no cargan cartera propia
>   en este modelo de datos).
> - El diálogo de baja fuerza la reasignación solo cuando hay cartera
>   activa (`cargaActiva > 0`); si no la hay, es una confirmación simple
>   (`"Esta acción es irreversible"`). Los candidatos de reasignación se
>   filtran por el mismo rol operativo del usuario dado de baja (un asesor
>   solo puede traspasar a otro asesor, un vendedor solo a otro vendedor).
> - La reasignación (mock) y la baja lógica (backend real) **no son una
>   transacción atómica**: si la reasignación falla, nunca se llama a
>   `deactivateUsuarioApi` (cubierto con test); pero si la reasignación
>   tuviera éxito y la baja real fallara después, la cartera ya se movió
>   con el usuario todavía activo -- limitación conocida y documentada en
>   `usuarios.api.ts::reassignCarteraActiva`, no resoluble desde el
>   frontend sin que el backend real de leads mueva esta reasignación a la
>   misma transacción de `deactivateUser` (igual que ya hace hoy con
>   `revokeAllForUser`).
> - Sin endpoint de reactivación: `updateUsuarioBodySchema`
>   (`backend/src/schemas/usuarios.schema.ts`) no incluye el campo `activo`
>   -- una vez dado de baja, no hay forma de reactivar a un usuario contra
>   el backend actual. No se construyó UI para esto (no está en el
>   checklist), pero se deja anotado; el botón "Dar de baja" se deshabilita
>   para usuarios ya inactivos para no sugerir una acción sin efecto.
>
> Fuera de alcance: conexión real de "carga activa de leads" y
> reasignación a un backend de leads (no existe, M5) y reactivación de
> usuario (no hay endpoint, ni pedido por el checklist).

- [x] Listado con rol, estado y carga activa de leads (carga activa: mock
      de F3, ver nota de brecha arriba)
- [x] Alta y edición de usuario
- [x] Baja lógica con reasignación obligatoria de la cartera activa
      (reasignación: mock de F3, ver nota de brecha arriba; la baja lógica
      en sí es backend real)
- [x] Restablecimiento de contraseña (backend real, sin brecha)

---

## F8 — Administración de bridges

Solo administrador.

> **Progreso:** implementado contra un **mock en memoria**
> (`funcionalidades/bridges/bridges.api.ts`), mismo criterio ya autorizado
> para F3-F6 (no el de F7, que sí tuvo backend real de usuarios) -- se
> verificó explícitamente antes de escribir código que **no existe ningún
> backend de bridges**: `backend/src/routes/` solo tiene `auth.routes.ts`,
> `salud.routes.ts` y `usuarios.routes.ts`; M8 (`docs/06-modulos-backend.md`)
> no está implementado ni siquiera como esqueleto, y no hay modelos Prisma de
> `bridges`/`cuentas_publicitarias`/`bridge_logs`. Cada punto de integración
> pendiente está marcado con el token `INTEGRACION-BACKEND` (grepeable en
> todo el repo). A diferencia de F3-F6, acá el **modelo de datos y el
> catálogo de estados/niveles sí están fijados** por
> `docs/03-modelo-datos.md` §`bridges`/`cuentas_publicitarias`/`bridge_logs`
> y por `docs/05-bridges.md` §7/§8 -- no son una suposición del frontend, se
> revisaron ambos documentos antes de diseñar (buscando "bridge" en todo
> `docs/`) para no inventar reglas ya especificadas.
>
> **Decisiones de diseño propias del frontend** (no fijadas por ningún
> contrato de backend, documentadas para que quien conecte el backend real
> las revise):
> - **Regla de "sin actividad"** (`bridges.utils.ts::evaluarAvisoBridge`):
>   docs/05 §8 dice "bridge sin leads durante 72 h **con campañas activas**",
>   pero `docs/03-modelo-datos.md` no modela "campaña" como entidad propia
>   del bridge, solo `cuentas_publicitarias`. Se interpretó "campañas
>   activas" como "al menos una cuenta publicitaria activa" -- la señal más
>   cercana disponible en el modelo de datos documentado, a confirmar contra
>   el backend real (M8) si existiera un concepto de campaña más granular. Un
>   bridge `INACTIVO` nunca dispara este aviso a propósito (ej. Google Forms
>   desactivado por defecto en producción, docs/05 §6): no recibir leads ahí
>   es el comportamiento esperado, no un problema de configuración.
> - **Simulación de "verificación inmediata" del token**
>   (`bridges.api.ts::saveTokenApi`): sin un proveedor real (Meta/LinkedIn/X)
>   contra el cual verificar, el mock rechaza cualquier token de menos de 20
>   caracteres para poder ejercitar el flujo de error de punta a punta. El
>   umbral es arbitrario y **no** es un contrato de ningún proveedor real.
>   Se usa `ApiError` (no un `Error` genérico, a diferencia de
>   `leadDetalle.api.ts` en F4) para que el mensaje llegue accionable al
>   usuario a través del manejo global de errores de mutaciones
>   (`api/queryClient.ts`) -- un `Error` simple ahí se reemplaza por el
>   mensaje genérico, porque `getErrorMessage` solo reexpone el mensaje de
>   instancias de `ApiError`. Vale la pena que un humano revise si F4 debería
>   adoptar el mismo criterio para sus propios `throw new Error(...)`, hoy
>   silenciados por el manejo global.
> - **Vigencia simulada del token nuevo por red social**
>   (`DIAS_VIGENCIA_TOKEN`): 60 días para Meta (Facebook/Instagram, docs/05
>   §3, "Page Access Token de larga duración (~60 días)"), 30 días para
>   LinkedIn (docs/05 §4 solo dice "más corta que la de Meta", sin cifra
>   exacta -- 30 es un valor razonable, no documentado), y sin expiración
>   (`null`) para X y Google Forms, que se autentican con clave de API, no
>   con un token OAuth (docs/05 §5/§6).
> - **Prueba de conexión determinística, no aleatoria**
>   (`bridges.api.ts::testConnectionApi`): el resultado se deriva del
>   `estado` actual del bridge para que sea testeable, y es puramente
>   diagnóstica -- a diferencia de guardar un token, no cambia el estado
>   guardado del bridge.
> - **Alta/baja de cuentas publicitarias** (`toggleCuentaActivaApi`,
>   `CuentasPublicitariasList.tsx`): el checklist de este documento solo pedía
>   "Detalle con cuentas publicitarias asociadas" (mostrarlas), pero
>   `docs/05-bridges.md` §7 sí documenta explícitamente "Alta y baja de
>   cuentas publicitarias" como parte del panel -- se agregó activar/desactivar
>   por ese motivo. **No** se agregó alta de una cuenta nueva: requeriría
>   decidir de dónde saldría el `idExterno` (¿catálogo que trae el backend
>   desde la plataforma? ¿texto libre del administrador?), decisión de
>   backend/UX no fijada por ningún documento -- señalada para no inventarla,
>   no construida en este cambio.
> - **Cinco bridges de ejemplo en el fixture**, uno por red social
>   documentada (docs/05 §3-§6), cubriendo deliberadamente las cuatro
>   combinaciones de aviso (ninguno, solo token expirado, solo sin actividad,
>   ambos a la vez) y el caso `INACTIVO` excluido -- ver el comentario de
>   cabecera de `bridges.api.ts` para el detalle de cada uno.
>
> TDD real: Vitest + Testing Library, 57 tests nuevos (326 en total en el
> frontend) cubriendo `evaluarAvisoBridge` (las cuatro combinaciones y el caso
> `INACTIVO`), `formatFecha`, el contrato completo del mock
> (`bridges.api.test.ts`: listado, detalle, guardado de token válido/inválido,
> prueba de conexión por estado, alta/baja de cuenta, bitácora con filtros
> combinables) y los componentes (`BridgesPage.test.tsx`,
> `BridgeDetallePage.test.tsx`: estados de carga/vacío/error, aviso destacado,
> token siempre vacío y su verificación inmediata, prueba de conexión,
> cuentas publicitarias, bitácora con filtro por nivel). `tsc` + `vite build`
> sin errores.
>
> Fuera de alcance: conexión real a un backend de bridges (M8, no existe) y
> el contrato exacto de sus futuros endpoints (nombres de rutas/parámetros
> son una suposición razonable a validar contra la implementación real antes
> de conectar).
>
> **Actualización (bridge-lifecycle-management, Fase 1, dev-front, fases
> 5-8 del plan de tareas):** se agregó administración completa del ciclo de
> vida del bridge, todavía contra el mismo mock en memoria -- el backend
> real (`bridge*`) se implementa en paralelo y de forma aislada en
> `dev-back`, sin mergear todavía; la Fase 9 (integration swap) queda
> explícitamente bloqueada hasta entonces.
> - **Alta** (`NuevoBridgeDialog.tsx`): el selector de red social se puebla
>   desde `useRedesSocialesSoportadas()` -- nunca un arreglo fijo en el
>   componente (mismo criterio que el filtro de F3 arriba). El bridge se
>   crea en `estado: "INACTIVO"`.
> - **Baja física u lógica** (`BridgesTable.tsx` + `ConfirmDialog.tsx`):
>   `deleteBridgeApi` decide con `ultimoLeadEn === null` como señal
>   equivalente a "nunca recibió leads" (decisión de mock documentada en el
>   propio archivo, porque `tipos/bridge.ts` no trae un conteo de leads al
>   frontend) -- baja física (se elimina la fila) si nunca recibió leads,
>   baja lógica (pasa a `INACTIVO`, reversible) si ya recibió alguno.
> - **Reactivación**: acción directa (`PATCH` simulado) desde la tabla,
>   sin diálogo de confirmación -- es reversible y no destructiva.
> - **Regeneración de clave y credenciales por estilo de autenticación**
>   (`CredencialBridgeForm.tsx`, `ESTILO_AUTENTICACION_POR_RED`): Google
>   Forms/X (`CLAVE_API`) solo ofrecen "Regenerar clave" -- el administrador
>   nunca escribe la clave, el servidor la genera; Facebook/Instagram/
>   LinkedIn (`TOKEN_PROVEEDOR`) siguen usando el `TokenForm` existente,
>   ahora etiquetado "Fase 2 · Proveedor OAuth no conectado todavía" pero
>   sin deshabilitarse -- la etiqueta distingue la falta de integración
>   real, no la ausencia de comportamiento simulado.
> - **Confirmación reforzada de clave de un solo uso**
>   (`ClaveBridgeModal.tsx`): comparte el mismo modal para alta y
>   regeneración. El cierre (overlay, `Escape`, botón "X" y el botón
>   "Entendido, cerrar") queda bloqueado hasta tildar la casilla "Ya copié
>   la clave y la guardé en un lugar seguro" -- una advertencia pasiva no
>   alcanza (spec).
> - **`BRIDGES_MOCK` mutable en tamaño**: a diferencia de F8 original (solo
>   mutaba campos), ahora también crece con `push` (alta) y se achica con
>   `splice` (baja física) -- `tests/bridges/bridges.api.test.ts` reconstruye
>   el arreglo completo en `afterEach`, no solo los campos.
>
> 38 tests nuevos (364 en total en el frontend): `bridges.api.test.ts` (17),
> `bridges.utils.test.ts` (2, `puedeEliminarseFisicamente`),
> `ClaveBridgeModal.test.tsx` (5), `CredencialBridgeForm.test.tsx` (4),
> `BridgesPage.test.tsx` (6, alta/baja/reactivación) y
> `LeadsFiltros.test.tsx` (4, filtro de F3). `tsc` + `vite build` sin
> errores.
>
> **Con F8 completo, el roadmap F1-F8 de `docs/07-modulos-frontend.md` queda
> con al menos una implementación en cada módulo.** Las brechas que quedan
> abiertas (autoservicio de contraseña para roles no-administrador en F2,
> conexión real a los backends de leads/dashboard/notificaciones/bridges en
> F3-F6/F8, actualización en tiempo real por SSE en F3/F5/F6, "carga activa
> de leads" y reasignación contra un backend real de leads en F7) están
> documentadas en la nota de progreso de cada módulo respectivo y dependen
> de trabajo de backend (M5-M9) que no existe todavía -- no son ítems sin
> hacer del frontend, son puntos de integración pendientes ya marcados con
> `INTEGRACION-BACKEND`.
>
> **Actualización (integración contra backend real de bridges, M4, dev-front,
> 2026-08-19):** `bridges.api.ts` reemplaza el mock en memoria por
> `httpClient` contra el backend real (`backend/src/routes/bridges.routes.ts`
> + `bridge.controller.ts`/`bridge.service.ts`/`cuenta-publicitaria.service.ts`,
> worktree `dev-back`, verificado leyendo el código fuente, no asumido).
> - **Gap de contrato confirmado y resuelto -- token/prueba de conexión son
>   por CUENTA PUBLICITARIA, no por bridge:** el mock original asumía
>   `POST /bridges/:id/token`; el backend real expone
>   `POST /bridges/:id/cuentas/:cuentaId/token` y
>   `.../cuentas/:cuentaId/probar-conexion`. Se rediseñó la UI: `TokenForm`/
>   `PruebaConexionBoton` ya no se renderizan una vez a nivel de
>   `BridgeDetallePage` -- se montan POR CADA FILA de
>   `CuentasPublicitariasList.tsx` (que ya tenía `cuentaId` por fila).
>   `CredencialBridgeForm.tsx` para el estilo `TOKEN_PROVEEDOR` ya no
>   renderiza ningún formulario a nivel de bridge, solo un texto que señala
>   la sección de cuentas. Un bridge sin cuentas no muestra ningún control
>   de token (el `EmptyState` ya existente lo cubre sin rama adicional).
> - **Segundo gap descubierto durante la integración (no estaba en el
>   encargo inicial):** el endpoint real de token solo verifica contra Graph
>   API de Meta (`meta-token.service.ts::verificarTokenPagina`) -- no hay
>   adaptador OAuth de LinkedIn del lado del servidor todavía, aunque
>   `ESTILO_AUTENTICACION_POR_RED` siga clasificando a LinkedIn como
>   `TOKEN_PROVEEDOR` igual que Facebook/Instagram. Se agregó
>   `REDES_CON_INTEGRACION_TOKEN_CONECTADA` (`catalogos.ts`) para que solo
>   Facebook/Instagram ofrezcan el formulario funcional por cuenta; LinkedIn
>   sigue mostrando el aviso "Fase 2 · Proveedor OAuth no conectado
>   todavía" sin llamar por error a la verificación de Meta.
> - **Tercer gap, documentado pero NO resuelto en este cambio (requiere
>   trabajo de backend):** `Bridge.tokenExpiraEn` es una constante `null` en
>   el backend real (`bridge.service.ts::TOKEN_EXPIRA_EN`) -- la expiración
>   real vive por cuenta (`CuentaPublicitaria.estadoToken`/`tokenExpiraEn`
>   en Prisma), pero `CuentaPublicitariaDto` no expone ninguno de los dos
>   campos por la API todavía. Consecuencia: `EstadoBridge ===
>   "TOKEN_EXPIRADO"` nunca lo produce el backend real para los bridges
>   actuales, así que la rama `tokenExpirado` de
>   `bridges.utils.ts::evaluarAvisoBridge` y la columna "Expiración de
>   token" de `BridgesTable.tsx`/`BridgeDetallePage.tsx` quedan
>   efectivamente inalcanzables contra datos reales -- no se eliminaron
>   (documentan un criterio real de docs/03/docs/05) pero necesitan que el
>   backend exponga esa señal por cuenta en un cambio futuro.
> - `CuentaPublicitariaBridge` (`tipos/bridge.ts`) gana `bridgeId` e
>   `instagramAccountId` para calzar con `CuentaPublicitariaDto` real.
> - Tests actualizados junto con la implementación (TDD, no se saltó pese a
>   ser una integración): `bridges.api.test.ts` reescrito completo contra
>   `httpClient` mockeado (antes contra `BRIDGES_MOCK`); nuevo
>   `tests/bridges/detalle/CuentasPublicitariasList.test.tsx` cubre el
>   token/prueba de conexión por cuenta (Facebook conectado, LinkedIn Fase
>   2, X/Google Forms sin controles); `BridgeDetallePage.test.tsx`/
>   `CredencialBridgeForm.test.tsx` actualizados a la nueva forma. 393 tests
>   en todo el frontend, todos en verde. `tsc` + `vite build` sin errores.
>   Verificado además end-to-end contra el backend real levantado con
>   Docker (`dev-back`): login, listado, detalle con cuentas, carga de
>   token (rechazo real de Graph API con credenciales de prueba), prueba de
>   conexión, alta/baja de cuenta, alta/baja/reactivación de bridge y
>   regeneración de clave -- todas las formas de respuesta coinciden
>   exactamente con lo que espera `bridges.api.ts`.
>
> **Actualización (tercer gap resuelto, dev-front, 2026-08-19):** el backend
> (`dev-back`) expuso `estadoToken`/`tokenExpiraEn` en `CuentaPublicitariaDto`,
> cerrando el gap documentado arriba. `tipos/bridge.ts::CuentaPublicitariaBridge`
> gana ambos campos; `bridges.utils.ts::evaluarAvisoBridge` ahora calcula
> `tokenExpirado`/`tokenProximoAVencer` (umbral propio de 7 días, sin plazo
> fijado en docs/03/docs/05 -- ver comentario en el archivo) como el PEOR CASO
> entre `bridge.cuentasPublicitarias`, en vez de leer `bridge.estado`/
> `bridge.tokenExpiraEn` (que siguen siendo datos muertos a nivel bridge, el
> backend los manda constantes). `BridgesTable.tsx` ("Expiración de token" y
> "Aviso") y `BridgeDetallePage.tsx` (resumen) usan el nuevo
> `proximaExpiracionTokenBridge`. `CuentasPublicitariasList.tsx` gana un
> indicador de estado de token POR FILA (sin agregación, vía
> `evaluarEstadoTokenCuenta`) -- más preciso que el agregado a nivel bridge,
> ya que ahí se tiene el contexto de cada cuenta. Antes de este cambio el
> aviso de "token expirado" estaba permanentemente inalcanzable contra el
> backend real (nunca se disparaba, porque leía el campo muerto); quedó
> detectado y corregido en un review previo a integrar. 20 tests nuevos/
> reescritos (413 en total en el frontend, todos en verde): `bridges.utils.test.ts`
> (peor caso entre cuentas, umbral de 7 días, `proximaExpiracionTokenBridge`,
> `evaluarEstadoTokenCuenta`), `CuentasPublicitariasList.test.tsx` (indicador
> por fila), `BridgesPage.test.tsx`/`BridgeDetallePage.test.tsx` actualizados
> a la nueva forma del DTO. `tsc` + `vite build` sin errores.

- [x] Listado con estado, último lead recibido y expiración de token
- [x] Detalle con cuentas publicitarias asociadas
- [x] Formulario de carga y renovación de token con verificación inmediata
- [x] Botón de prueba de conexión
- [x] Bitácora de errores con filtro por nivel y fecha
- [x] Aviso destacado ante token expirado o bridge sin actividad

> El campo de token siempre se muestra vacío, nunca precargado. Se envía solo al
> guardar.

---

## Criterios transversales de calidad

- **Accesibilidad:** el semáforo nunca se comunica solo por color. Etiqueta de
  texto siempre presente, para daltonismo y para lectores de pantalla.
- **Estados de error:** toda petición fallida muestra un mensaje accionable en
  español, no un código HTTP.
- **Confirmaciones:** las acciones irreversibles (cierre de lead, baja de
  usuario) exigen confirmación explícita.
- **Formato de fechas:** `DD/MM/AAAA HH:mm` en zona horaria local del navegador.
- **Formato de moneda:** dólar estadounidense con separador de miles.
- **Sin bloqueo de interfaz:** ninguna operación deja la pantalla congelada sin
  indicador de progreso.
