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

- [ ] Tabla con columnas: cliente, teléfono, red social, campaña, etapa,
      semáforo, responsable, estado de SLA, fecha de ingreso
- [ ] Indicador de semáforo con color **y** etiqueta de texto
- [ ] Contador de SLA en vivo con formato `HH:MM:SS`, actualizado en cliente
- [ ] Distintivo visual para leads de reingreso
- [ ] Filtros combinables: etapa, semáforo, red social, campaña, responsable,
      rango de fechas, estado de SLA
- [ ] Búsqueda por nombre, teléfono o correo
- [ ] Paginación del lado del servidor
- [ ] Vista adaptada por rol: asesor y vendedor ven solo su cartera, sin columna
      de responsable
- [ ] Acciones masivas de asignación para supervisor y administrador
- [ ] Actualización por SSE cuando ingresa un lead nuevo

> El contador de SLA se calcula en el cliente a partir de la marca de tiempo
> recibida. No consultes al servidor cada segundo: a 100 concurrentes eso son
> 100 peticiones por segundo para mostrar un reloj.

---

## F4 — Detalle del lead

Muestra el **estado actual** con su formulario, no un timeline de interacciones.

- [ ] Encabezado: nombre, semáforo, etapa, responsable, contador de SLA
- [ ] Datos de contacto: teléfono, correos asociados, marca de dato inválido
- [ ] Origen: red social, campaña, cuenta publicitaria, fecha de ingreso
- [ ] Campos dinámicos del formulario de la campaña
- [ ] Formulario de la etapa vigente con cálculo de puntuación
- [ ] Guía de acción según el color del semáforo
- [ ] Selector de cambio de etapa que abre el formulario correspondiente
- [ ] Acción de traspaso a vendedor (asesor, desde etapa Contactado)
- [ ] Acción de reasignación con la regla de semáforo aplicada
- [ ] Panel de citas: agendar, reprogramar, marcar resultado
- [ ] Campos de cierre para Venta y No Venta con validación

---

## F5 — Dashboard

- [ ] Tarjetas de resumen: total de leads, en gestión, cerrados, tasa de
      conversión, tiempo promedio de primera respuesta, tiempo promedio de cierre
- [ ] Gráfica de barras: leads por red social
- [ ] Gráfica de barras: leads por asesor
- [ ] Gráfica de embudo: leads por etapa
- [ ] Gráfica de barras: leads por campaña
- [ ] Gráfica de barras apiladas: red social × semáforo (la que responde de qué
      red llegan los leads con más probabilidad de cierre)
- [ ] Selector de rango de fechas con comparativa contra el período anterior
- [ ] Alcance por rol: general para administrador y supervisor, personal para
      asesor y vendedor
- [ ] Actualización en tiempo real vía SSE

**Biblioteca de gráficas:** Recharts. Es declarativa, tipada, y su tamaño de
paquete es razonable para el volumen de gráficas de este dashboard.

---

## F6 — Notificaciones

- [ ] Campana con contador de no leídas
- [ ] Panel desplegable con listado y navegación al lead relacionado
- [ ] Marcar como leída, individual y masivo
- [ ] Aviso emergente al llegar una notificación por SSE
- [ ] Indicador de reconexión cuando el canal SSE se interrumpe

---

## F7 — Administración de usuarios

Solo administrador.

- [ ] Listado con rol, estado y carga activa de leads
- [ ] Alta y edición de usuario
- [ ] Baja lógica con reasignación obligatoria de la cartera activa
- [ ] Restablecimiento de contraseña

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
