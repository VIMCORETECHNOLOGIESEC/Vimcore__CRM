# Frontend — CRM Embudo de Leads

SPA en React 19 + TypeScript + Vite + Tailwind CSS, con componentes
shadcn/ui (estilo zinc/new-york). Interfaz exclusivamente en español, web
responsive (móvil/tableta/escritorio).

Ver el estado verificado de cada módulo (qué está terminado y qué queda
pendiente, con evidencia contra el código real) en
[`../docs/07-modulos-frontend.md`](../docs/07-modulos-frontend.md).

---

## Qué hace

- **Autenticación** (F2): login, persistencia de sesión con refresco
  automático de token, cierre automático al expirar, perfil con cambio de
  contraseña.
- **Listado de leads** (F3): tabla con filtros combinables (etapa,
  semáforo, red social, campaña, responsable, rango de fechas, estado de
  SLA), búsqueda libre, contador de SLA en vivo, acciones masivas de
  asignación.
- **Detalle del lead** (F4): timeline de progreso de etapa (lineal hacia
  adelante), formulario de calificación por etapa con cálculo de
  puntuación, traspaso a vendedor, reasignación, panel de citas, cierre de
  Venta/No Venta.
- **Dashboard** (F5): 7 tarjetas/gráficas de KPIs con alcance por rol,
  comparativa contra el período anterior, y **actualización en tiempo real
  vía SSE** — el listener global recibe la señal del backend y refresca los
  datos en segundo plano sin polling.
- **Notificaciones** (F6): campana con contador de no leídas, panel con
  navegación al lead relacionado, aviso emergente al llegar una
  notificación por SSE, indicador de reconexión.
- **Administración de usuarios** (F7, solo administrador): listado con
  filtro/paginación real, alta/edición, baja lógica (reasignación de
  cartera resuelta por el backend), restablecimiento de contraseña.
- **Administración de bridges** (F8, solo administrador): listado con
  estado y expiración de token, detalle con cuentas publicitarias, carga y
  renovación de token con verificación inmediata, prueba de conexión,
  bitácora de errores.

---

## Requisitos

- Node 22+
- pnpm 11.21.0 (`packageManager` en el `package.json` raíz del monorepo)
- El backend corriendo y alcanzable (local, Docker Compose, o el ambiente
  que apunte `VITE_API_BASE_URL`)

---

## Desarrollo local

Desde la **raíz del monorepo**:

```bash
pnpm install
pnpm --filter frontend dev
```

Levanta Vite en `http://localhost:5173` con recarga en caliente. Por
defecto el cliente HTTP apunta a `http://localhost:3000/api/v1`
(`VITE_API_BASE_URL` en `frontend/src/api/httpClient.ts`) — si el backend
corre en otro host/puerto, definí `VITE_API_BASE_URL` en un `.env` propio
de `frontend/` (formato Vite estándar, `import.meta.env`).

### Vía Docker Compose

Ver [`../README.md`](../README.md#despliegue-local-con-docker) — el
servicio `frontend` espera a que `backend` esté saludable antes de
arrancar, y sirve en `http://localhost:5173` con el código montado por bind
mount para hot-reload.

---

## Tests

```bash
pnpm --filter frontend test
```

Vitest + jsdom + Testing Library (`@testing-library/react`, `jest-dom`,
`user-event`). No requiere backend ni base de datos: todo mockeado a nivel
de `httpClient`/`fetch`.

---

## Build de producción

```bash
pnpm --filter frontend build     # tsc -p tsconfig.json + vite build -> frontend/dist
pnpm --filter frontend preview   # sirve ese build localmente para verificarlo
```

El `Dockerfile` de este paquete está orientado a desarrollo: corre `pnpm
dev` con el código montado por bind mount, no un build de producción. Para
un despliegue productivo real, generar una imagen que sirva el contenido
estático de `frontend/dist` (ej. nginx u otro servidor estático) detrás de
un build multi-stage, en vez de correr el servidor de desarrollo de Vite.

---

## Estructura

```
frontend/src/
├── api/            Cliente HTTP (JWT + refresco automático) y utilidades compartidas
├── componentes/    Componentes reutilizables (estados de carga/vacío/error, confirmaciones)
├── components/ui/  Primitivas shadcn/ui
├── funcionalidades/
│   ├── autenticacion/
│   ├── leads/
│   ├── dashboard/
│   ├── usuarios/
│   ├── bridges/
│   └── notificaciones/
├── layouts/        Layout autenticado (barra lateral, encabezado, canal SSE global)
├── tipos/          Tipos compartidos con el contrato del backend
└── router.tsx       Rutas y protección por rol
```

Cada carpeta de `funcionalidades/<módulo>/` sigue el mismo patrón: un
`*.api.ts` (llamadas HTTP), hooks de TanStack Query, componentes de página,
y sus tests en `frontend/tests/<módulo>/`.
