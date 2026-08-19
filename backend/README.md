# Backend — CRM Embudo de Leads

API REST en Express + TypeScript + Prisma sobre PostgreSQL. Capas
`routes/ → controllers/ → services/ → repositories/`: los controllers solo
traducen HTTP, toda la regla de negocio vive en `services/`, y `repositories/`
es la única capa que toca Prisma directo.

Ver el estado verificado de cada módulo (qué está terminado y qué queda
pendiente, con evidencia contra el código real) en
[`../docs/06-modulos-backend.md`](../docs/06-modulos-backend.md).

---

## Qué hace

- **Autenticación y usuarios** (M2): login/refresh/logout con JWT (rotación
  de refresh tokens), 4 roles (`ADMINISTRADOR`/`SUPERVISOR`/`ASESOR`/`VENDEDOR`),
  CRUD de usuarios, baja lógica con reasignación automática y atómica de la
  cartera activa del usuario dado de baja.
- **Normalización y deduplicación** (M3): teléfono a E.164, resolución de
  identidad de cliente, regla de reingreso a los 90 días, manejo de
  condiciones de carrera en la inserción.
- **Ingesta y bridges** (M4): endpoint genérico por clave de bridge,
  adaptador Google Forms, adaptador Meta (handshake + verificación de firma
  + buzón durable con worker de reintento), cifrado de tokens en reposo
  (AES-256-GCM), administración de bridges/cuentas publicitarias, jobs
  programados de verificación de token y detección de bridge sin actividad.
- **Gestión de leads** (M5): listado con filtros/paginación, detalle,
  transición de etapa transaccional con formulario obligatorio y validación
  server-side de la secuencia de etapas permitida, motor de semáforo.
- **Asignación, traspaso y SLA** (M6): asignación automática por menor carga
  activa (desempate FIFO), asignación/reasignación/traspaso manual, control
  de SLA de 24 h con job de detección de atrasados.
- **Citas** (M7): CRUD de citas de un lead, reprogramación, recordatorio
  automático.
- **Notificaciones y tiempo real** (M8): notificaciones in-app y canal SSE
  autenticado (`GET /api/v1/eventos`) con reconexión por `Last-Event-ID`.
- **Dashboard y métricas** (M9): 7 endpoints de agregación de KPIs con
  alcance por rol, y una señal SSE (`metricas.actualizadas`, con debounce)
  que dispara refetch en el frontend ante cualquier cambio relevante.

---

## Requisitos

- Node 22+
- pnpm 11.21.0 (`packageManager` en el `package.json` raíz del monorepo)
- PostgreSQL accesible (local, o vía Docker Compose desde la raíz del repo)

---

## Desarrollo local

Desde la **raíz del monorepo** (los comandos `pnpm --filter backend` deben
correr ahí, no desde `backend/`, porque el workspace vive un nivel arriba):

```bash
pnpm install
```

Copiá `.env.example` (raíz del repo) a `.env` y completá los valores —
detalle de cada variable en ese archivo. Para desarrollo fuera de Docker,
`DATABASE_URL` debe apuntar a un PostgreSQL realmente alcanzable desde tu
máquina (no al hostname interno `db` de Compose).

```bash
# generar el cliente de Prisma
pnpm --filter backend exec prisma generate

# aplicar el schema (desarrollo: crea/actualiza migraciones)
pnpm --filter backend exec prisma migrate dev

# sembrar datos de desarrollo (usuarios por rol + bridge de Google Forms de prueba)
pnpm --filter backend exec prisma db seed

# levantar con recarga en caliente
pnpm --filter backend dev
```

El servidor escucha en `PORT` (por defecto `3000`), con la API bajo
`/api/v1`. Endpoint de salud sin autenticación: `GET /api/v1/salud`.

### Vía Docker Compose

Ver [`../README.md`](../README.md#despliegue-local-con-docker) — `docker
compose up` desde la raíz aplica las migraciones automáticamente al
arrancar (`prisma migrate deploy`), no hace falta correrlas a mano.

---

## Tests

```bash
pnpm --filter backend test
```

Corre contra una base de datos real (Vitest + `tests/setup.ts`, que aborta
si `NODE_ENV` no es `test` — nunca corre contra una base separada de la que
usa desarrollo, D-H). Necesitás `DATABASE_URL` apuntando a un PostgreSQL
realmente alcanzable con `NODE_ENV=test` exportado. Si estás corriendo el
stack por Docker Compose y querés tests desde el host, exponé el puerto de
`db` con un `docker-compose.override.yml` (ver nota en el README raíz) y
apuntá `DATABASE_URL` a `localhost:<puerto expuesto>` en vez de `db:5432`.

---

## Build de producción

```bash
pnpm --filter backend build   # tsc -p tsconfig.json -> backend/dist
pnpm --filter backend start   # node dist/index.js
```

El `Dockerfile` de este paquete (usado por `docker-compose.yml`) está
orientado a desarrollo: corre `pnpm dev` con el código montado por bind
mount para hot-reload, no un build de producción multi-stage. Para un
despliegue productivo real, generar una imagen que corra `pnpm build` +
`pnpm start` sobre el output compilado, sin bind mounts.

---

## Variables de entorno relevantes

Ver [`../.env.example`](../.env.example) para la lista completa con su
propósito documentado. Resumen:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión Prisma a PostgreSQL |
| `JWT_SECRET` | Firma HS256 de access/refresh tokens (mín. 32 caracteres) |
| `JWT_ACCESS_TTL_SECONDS` / `JWT_REFRESH_TTL_SECONDS` | Vigencia de tokens, en segundos |
| `TOKEN_ENCRYPTION_KEY` | Cifrado AES-256-GCM de tokens de cuentas publicitarias (64 hex / 32 bytes) |
| `CORS_ORIGIN` | Origen permitido para el frontend |
| `SEED_PASSWORD` / `SEED_BRIDGE_CLAVE_API` | Solo para `prisma db seed`, desarrollo |
| `META_WEBHOOK_VERIFY_TOKEN` / `META_APP_SECRET` / `META_APP_ID` | Adaptador de ingesta de Meta |
