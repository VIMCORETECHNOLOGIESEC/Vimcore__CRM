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
> Fuera de alcance de esta implementación: actualización por SSE (depende
> de infraestructura de bridges/tiempo real que todavía no existe, F8) y el
> contrato exacto de query params de `GET /api/v1/leads` (los nombres
> usados en `LeadsQueryParams` son una suposición razonable a validar
> contra la implementación real del backend antes de conectar).

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

- [x] Encabezado: nombre, semáforo, etapa, responsable, contador de SLA
- [x] Datos de contacto: teléfono, correos asociados, marca de dato inválido
- [x] Origen: red social, campaña, cuenta publicitaria, fecha de ingreso
- [x] Campos dinámicos del formulario de la campaña
- [x] Formulario de la etapa vigente con cálculo de puntuación
- [x] Guía de acción según el color del semáforo
- [x] Selector de cambio de etapa que abre el formulario correspondiente
- [x] Acción de traspaso a vendedor (asesor, desde etapa Contactado)
- [x] Acción de reasignación con la regla de semáforo aplicada
- [x] Panel de citas: agendar, reprogramar, marcar resultado
- [x] Campos de cierre para Venta y No Venta con validación

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

> **Progreso:** implementado contra un **mock en memoria**
> (`funcionalidades/notificaciones/notificaciones.api.ts`) -- M8
> (`docs/06-modulos-backend.md`) no existe todavía ni como esqueleto:
> `GET /api/v1/notificaciones`, `PATCH /api/v1/notificaciones/:id/leer` y el
> canal SSE `GET /api/v1/eventos` no están implementados. Cada punto de
> integración pendiente está marcado con el token `INTEGRACION-BACKEND`
> (grepeable en todo el repo). Reemplaza el disparador deshabilitado que
> había dejado F1 en `layouts/Header.tsx` por el componente real
> `CampanaNotificaciones.tsx`.
>
> **Decisión de mock propia del frontend, distinta al criterio de F3/F4/F5:**
> `leads.api.ts` arma su fixture contra ids de usuario inventados
> (`asesor-1`, `vendedor-1`...) porque F3+ no dependía de quién inició
> sesión de verdad. F2 sí autentica contra el backend real, así que el `id`
> del usuario logueado en cualquier ambiente de prueba de este cambio es el
> que emite ese backend, no uno inventado acá. Por eso las notificaciones se
> **siembran de forma perezosa por `usuarioId`** la primera vez que se piden
> (`seedParaUsuario`, ver el comentario en `notificaciones.api.ts`): quien
> sea que inicie sesión ve un set de ejemplo variado (con y sin lead
> asociado, leídas y no leídas, cubriendo los 7 tipos de evento de
> docs/02-reglas-negocio.md §8), y las mutaciones de marcado persisten sobre
> ese mismo estado en memoria durante la sesión del navegador.
>
> **Otras decisiones propias, a validar cuando exista M8:**
> - `TipoNotificacion` (`tipos/notificacion.ts`) es una propuesta de nombres
>   de enum (un valor por fila de la tabla de docs/02 §8) -- docs/03 fija la
>   columna `notificaciones.tipo` como `enum` pero no sus valores exactos.
> - El marcado masivo ("leer todas") no tiene endpoint documentado en M8
>   (el ítem del checklist de backend solo dice "y marcado masivo" sin
>   fijar la ruta) -- decisión de backend pendiente, no inventada acá.
> - Se retiró `components/ui/scroll-area.tsx` de la lista de dependencias
>   activas del panel: usar `@radix-ui/react-scroll-area` ahí disparaba
>   `ResizeObserver is not defined` en jsdom (Vitest/Testing Library). Se
>   reemplazó por un `<div className="overflow-y-auto">` nativo, suficiente
>   para una lista de notificaciones y sin la dependencia frágil en tests;
>   el componente sigue en el repo por si otra pantalla lo necesita.
>
> TDD: Vitest, 27 tests nuevos (240 en total en el frontend) cubriendo el
> conteo de no leídas, el formato de fecha relativa/absoluta, la siembra
> perezosa por usuario, el aislamiento entre usuarios, y el marcado
> individual/masivo del componente (mockeando la capa `notificaciones.api.ts`,
> mismo patrón que `LeadsPage.test.tsx`). `tsc` + `vite build` sin errores.

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

- [ ] Listado con estado, último lead recibido y expiración de token
- [ ] Detalle con cuentas publicitarias asociadas
- [ ] Formulario de carga y renovación de token con verificación inmediata
- [ ] Botón de prueba de conexión
- [ ] Bitácora de errores con filtro por nivel y fecha
- [ ] Aviso destacado ante token expirado o bridge sin actividad

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
