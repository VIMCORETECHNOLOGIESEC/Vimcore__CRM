# 18 — Desarrollo local: variables, comandos y estructura

> **Estado:** vigente.
>
> Migra el contenido operativo de `backend/README.md` y `frontend/README.md`
> que no es ejecución en host: tablas de variables de entorno, comandos de
> build/test dentro de los contenedores, y estructura de carpetas. El flujo
> de arranque (`docker compose up --build`) y los comandos de verificación
> canónicos (`docker compose exec ... pnpm test`) están en
> [`../README.md`](../README.md#4-ejecutar-verificaciones) — este documento
> no lo repite.
>
> **No incluye** instrucciones para correr `pnpm`, Node o PostgreSQL
> directamente sobre el host: el único flujo soportado es Docker Compose
> (`README.md`, `docs/00-estado-documentacion.md`).

---

## 1. Variables de entorno

Referencia completa, sin secretos, en [`../.env.example`](../.env.example).
Resumen por paquete:

### Backend

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión Prisma a PostgreSQL. En Docker Compose usa el host interno `db`, nunca `localhost` |
| `JWT_SECRET` | Firma HS256 de access/refresh tokens (mín. 32 caracteres) |
| `JWT_ACCESS_TTL_SECONDS` / `JWT_REFRESH_TTL_SECONDS` | Vigencia de tokens, en segundos |
| `TOKEN_ENCRYPTION_KEY` | Cifrado AES-256-GCM de tokens de cuentas publicitarias (64 hex / 32 bytes) |
| `CORS_ORIGIN` | Origen permitido para el frontend |
| `SEED_PASSWORD` / `SEED_BRIDGE_CLAVE_API` | Solo para `prisma db seed`, desarrollo |
| `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET` / `META_APP_ID` | Adaptador de ingesta de Meta |

### Frontend

| Variable | Para qué |
|---|---|
| `VITE_API_BASE_URL` | Base del cliente HTTP (`frontend/src/api/httpClient.ts`). Por defecto `http://localhost:3000/api/v1`; solo hace falta fijarla si el backend corre en otro host/puerto |

---

## 2. Comandos dentro de los contenedores

Con el stack levantado (`docker compose up --build`, ver README raíz), todos
los comandos de paquete corren dentro del contenedor correspondiente:

```bash
# Prisma (backend)
docker compose exec backend pnpm exec prisma generate
docker compose exec backend pnpm exec prisma migrate dev   # crea/actualiza migraciones
docker compose exec backend pnpm exec prisma db seed       # usuarios por rol + bridges de prueba

# Tests
docker compose exec backend pnpm test
docker compose exec frontend pnpm test

# Build
docker compose exec backend pnpm build     # tsc -p tsconfig.json -> backend/dist
docker compose exec backend pnpm start     # node dist/index.js, sobre el build ya generado
docker compose exec frontend pnpm build    # tsc + vite build -> frontend/dist
docker compose exec frontend pnpm preview  # sirve ese build para verificarlo localmente
```

El backend corre pruebas con Vitest contra una base de datos real
(`tests/setup.ts` aborta si `NODE_ENV` no es `test`, D-H — nunca corre contra
la base de desarrollo). El frontend corre Vitest + jsdom + Testing Library
sin backend ni base de datos: todo mockeado a nivel de `httpClient`/`fetch`.

> **Nota de producción:** el `Dockerfile` de cada paquete está orientado a
> desarrollo (corre el servidor de dev con el código montado por bind mount
> para hot-reload), no es un build multi-stage de producción. Un despliegue
> productivo real requiere una imagen aparte que corra `pnpm build` +
> `pnpm start` (backend) o sirva `frontend/dist` con un servidor estático
> (ej. nginx) detrás de un build multi-stage.

---

## 3. Estructura de carpetas

### Backend (`backend/src/`)

Capas `routes/ → controllers/ → services/ → repositories/`: los controllers
solo traducen HTTP, la regla de negocio vive en `services/`, y
`repositories/` es la única capa que toca Prisma directo. Detalle de cada
módulo (M1-M9) en [`06-modulos-backend.md`](06-modulos-backend.md).

```
backend/src/
├── routes/         Definición de endpoints por dominio
├── controllers/     Traducción HTTP ↔ servicio
├── services/        Regla de negocio
├── repositories/     Acceso a datos vía Prisma
├── adapters/         Traducción de payload por bridge (Meta, Google Forms)
├── jobs/             Trabajos programados (SLA, recordatorios, verificación de token)
├── middlewares/       Auth, clave de bridge, manejo de errores
├── schemas/           Validación Zod en el borde de cada controller
└── lib/               Utilidades compartidas (cifrado, firma, etc.)
```

### Frontend (`frontend/src/`)

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
└── router.tsx      Rutas y protección por rol
```

Cada carpeta de `funcionalidades/<módulo>/` sigue el mismo patrón: un
`*.api.ts` (llamadas HTTP), hooks de TanStack Query, componentes de página, y
sus tests en `frontend/tests/<módulo>/`. Detalle de cada módulo (F1-F8) en
[`07-modulos-frontend.md`](07-modulos-frontend.md).
