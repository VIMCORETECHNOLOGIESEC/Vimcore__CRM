# CRM Embudo de Leads

CRM comercial para captar, calificar y dar seguimiento a leads publicitarios
de una sola empresa (instancia aislada, sin multi-tenant) a lo largo de un
embudo de cinco etapas: **Nuevo → Contactado → Cita → Venta/No Venta**.
Ingesta multicanal por webhook (Meta, Google Forms, y en el futuro
LinkedIn/X), deduplicación de clientes, asignación automática por carga de
trabajo, semáforo de calificación calculado, control de SLA de 24 h,
notificaciones en vivo por SSE y un dashboard de KPIs también en vivo.

Alcance completo, riesgos y decisiones de diseño: [`docs/01-alcance-mvp.md`](docs/01-alcance-mvp.md).
Estado real de cada módulo backend/frontend, verificado contra el código:
[`docs/06-modulos-backend.md`](docs/06-modulos-backend.md) y
[`docs/07-modulos-frontend.md`](docs/07-modulos-frontend.md).

---

## Stack

Monorepo `pnpm` con tres paquetes:

| Paquete | Qué es | Detalle |
|---|---|---|
| [`backend/`](backend/README.md) | API REST — Express + TypeScript + Prisma + PostgreSQL | ver su README |
| [`frontend/`](frontend/README.md) | SPA — React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui | ver su README |
| `packages/schemas/` | Schemas Zod compartidos entre backend y frontend (ej. política de contraseña, login) | sin README propio, es solo tipos/schemas |

Node 22+, pnpm 11.21.0 (fijado en `packageManager` de `package.json`).

---

## Estado del desarrollo (verificado, no aspiracional)

**Backend — 9 módulos (M1-M9):** 7 completos al 100%. `M4` (ingesta/bridges)
tiene los adaptadores Meta y Google Forms terminados; LinkedIn y X quedan
pendientes por depender de aprobación externa de cada plataforma. `M5`
(gestión de leads) tiene dos mejoras de UX documentadas como backlog no
bloqueante. Detalle módulo por módulo: [`docs/06-modulos-backend.md`](docs/06-modulos-backend.md#estado-consolidado-verificado-contra-código-real-en-testintegration-2026-08-19).

**Frontend — 8 módulos (F1-F8):** 6 completos al 100%, incluido el dashboard
con actualización en tiempo real por SSE. Los dos módulos restantes (listado
y detalle de leads) tienen gaps puntuales de UX/tiempo real, todos
documentados como backlog no bloqueante. Detalle: [`docs/07-modulos-frontend.md`](docs/07-modulos-frontend.md#estado-consolidado-verificado-contra-código-real-en-testintegration-2026-08-19).

Ningún módulo propuesto está sin empezar. Los pendientes que quedan no
bloquean un despliegue para pruebas con los bridges de **Meta** y
**Google Forms** (los dos que sí están completos de punta a punta).

---

## Despliegue local con Docker

Todo el stack (base de datos, backend, frontend) levanta con Docker Compose
desde la raíz del repositorio — no hace falta instalar Node/PostgreSQL en la
máquina host.

### 1. Variables de entorno

```bash
cp .env.example .env
```

Completá `.env` con valores reales. Como mínimo para levantar el stack:

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — credenciales de la
  base de datos del contenedor `db`.
- `DATABASE_URL` — debe apuntar al host `db` (nombre del servicio en
  `docker-compose.yml`), nunca a `localhost`, porque backend y `db` se
  conectan por la red interna de Compose:
  `postgresql://<user>:<password>@db:5432/<db_name>?schema=public`.
- `JWT_SECRET` — mínimo 32 caracteres (`openssl rand -hex 32`).
- `TOKEN_ENCRYPTION_KEY` — exactamente 64 caracteres hex / 32 bytes
  (`openssl rand -hex 32`), usado para cifrar en reposo los tokens de las
  cuentas publicitarias de los bridges.
- `SEED_PASSWORD` / `SEED_BRIDGE_CLAVE_API` — solo si vas a correr el seed
  de datos de desarrollo (ver más abajo).

El resto de variables (Meta, CORS, TTL de JWT) tienen su propio comentario
en [`.env.example`](.env.example) — es la guía versionada de qué necesita
cada entorno.

### 2. Levantar el stack

```bash
docker compose up
```

Esto construye y levanta tres servicios:

| Servicio | Puerto host | Notas |
|---|---|---|
| `db` (PostgreSQL 16) | no expuesto por defecto | ver nota de Windows más abajo si necesitás conectarte desde el host |
| `backend` | `3000` | corre `prisma migrate deploy` automáticamente antes de arrancar (`pnpm --filter backend dev`), con hot-reload vía bind mount |
| `frontend` | `5173` | `pnpm --filter frontend dev` (Vite), con hot-reload vía bind mount |

`backend` espera a que `db` esté saludable (`healthcheck` con `pg_isready`);
`frontend` espera a que `backend` esté saludable (`GET /api/v1/salud`) antes
de arrancar. La primera vez que corre, `backend` aplica todas las
migraciones de Prisma pendientes contra `db` — no hace falta correrlas a
mano.

Accedé a la app en `http://localhost:5173`. La API queda en
`http://localhost:3000/api/v1`.

### Nota Windows/local: exponer el puerto de la base

Si necesitás conectarte a `db` desde el host (un cliente SQL, correr tests
del backend fuera de Docker, etc.), el servicio `db` no publica su puerto
por defecto. Agregá un `docker-compose.override.yml` (gitignored,
específico de tu máquina) con un puerto libre en el host:

```yaml
services:
  db:
    ports:
      - "5433:5432"
```

Con eso, `DATABASE_URL` para herramientas del host (no para el contenedor
`backend`, que sigue usando `db:5432` interno) pasa a ser
`postgresql://<user>:<password>@localhost:5433/<db_name>?schema=public`.

### 3. Sembrar datos de desarrollo (opcional)

Con el stack levantado:

```bash
docker compose exec backend pnpm exec prisma db seed
```

Crea un usuario `activo=true` por cada rol de `RolUsuario`
(`ADMINISTRADOR`/`SUPERVISOR`/`ASESOR`/`VENDEDOR`) con la contraseña de
`SEED_PASSWORD`, y un bridge de Google Forms de prueba con la clave de API
de `SEED_BRIDGE_CLAVE_API`. Pensado para desarrollo/demo, no para producción.

### Apagar y limpiar

```bash
docker compose down            # detiene los contenedores, conserva el volumen de datos
docker compose down -v         # además borra el volumen (pierde los datos de la BD)
```

---

## Desarrollo sin Docker

Cada paquete documenta su propio flujo de desarrollo local (instalación,
tests, build) en su README: [`backend/README.md`](backend/README.md) y
[`frontend/README.md`](frontend/README.md). Necesitás un PostgreSQL propio
accesible (local o el mismo contenedor `db` con el puerto expuesto, ver nota
de arriba) y replicar las variables de `.env.example` en tu entorno.

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/01-alcance-mvp.md`](docs/01-alcance-mvp.md) | Qué está dentro y fuera del MVP, riesgos abiertos |
| [`docs/02-reglas-negocio.md`](docs/02-reglas-negocio.md) | Reglas de negocio del embudo, asignación, SLA |
| [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md) | Modelo de datos (Prisma) |
| [`docs/04-formularios-semaforo.md`](docs/04-formularios-semaforo.md) | Formularios de calificación por etapa y rúbrica del semáforo |
| [`docs/05-bridges.md`](docs/05-bridges.md) | Contrato de ingesta por red social/bridge |
| [`docs/06-modulos-backend.md`](docs/06-modulos-backend.md) | Checklist y estado real de cada módulo backend (M1-M9) |
| [`docs/07-modulos-frontend.md`](docs/07-modulos-frontend.md) | Checklist y estado real de cada módulo frontend (F1-F8) |
| [`docs/08-dashboard-kpis.md`](docs/08-dashboard-kpis.md) | Definición de los KPIs del dashboard |
| [`docs/09-linea-grafica-frontend.md`](docs/09-linea-grafica-frontend.md) | Paleta, línea gráfica, librerías de UI |
| [`docs/11-plan-integracion.md`](docs/11-plan-integracion.md) | Plan de integración de las ramas de desarrollo |
