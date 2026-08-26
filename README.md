# CRM Embudo de Leads

CRM comercial para captar, deduplicar, asignar y dar seguimiento a leads de
campañas digitales mediante un embudo de cinco etapas:
**Nuevo → Contactado → Cita → Venta/No Venta**.

El producto implementado es **single-company**: cada cliente usa una instancia
aislada y una base de datos propia. La evolución hacia holdings y múltiples
empresas está en análisis; todavía no existe aislamiento multi-tenant ni debe
asumirse en cambios técnicos.

> Antes de diseñar o implementar, consulte
> [`docs/00-estado-documentacion.md`](docs/00-estado-documentacion.md). Ese mapa
> indica qué documentos están vigentes, cuáles requieren verificar el código y
> cuáles no son confiables todavía.

## Qué incluye hoy

- Ingesta por bridges de Meta y Google Forms.
- Normalización y deduplicación de clientes por teléfono.
- Asignación de leads por carga y roles operativos.
- Seguimiento por etapas, semáforo, SLA, citas y cierre comercial.
- Notificaciones in-app y actualizaciones unidireccionales por SSE.
- Dashboard de KPIs comerciales.

El alcance comprometido y sus exclusiones están en
[`docs/01-alcance-mvp.md`](docs/01-alcance-mvp.md). El snapshot técnico vigente,
incluidas las brechas conocidas, está en
[`docs/11-plan-integracion.md`](docs/11-plan-integracion.md).

Para una revisión ejecutiva entre equipos, comience por
[`docs/16-hallazgos-y-preguntas.md`](docs/16-hallazgos-y-preguntas.md). Sintetiza
hallazgos y el orden de las decisiones pendientes, pero no es un contrato
funcional ni autoriza implementación.

## Stack

Monorepo `pnpm` ejecutado mediante Docker Compose:

| Paquete | Responsabilidad | Tecnología principal |
|---|---|---|
| `backend/` | API REST, Prisma, bridges, jobs y SSE | Express + TypeScript + PostgreSQL |
| `frontend/` | SPA responsive | React 19 + TypeScript + Vite + Tailwind CSS |
| `packages/schemas/` | Contratos Zod compartidos | TypeScript + Zod |

La versión de pnpm está fijada en `package.json`. No se soporta instalar Node,
pnpm ni PostgreSQL directamente en el host para trabajar en este repositorio.

## Inicio rápido — solo Docker

### Requisitos

- Docker Engine con Docker Compose v2.
- Puertos `3000` y `5173` libres.

### 1. Configurar variables

```bash
cp .env.example .env
```

Complete `.env` sin versionarlo. Para el entorno Docker local:

- `DATABASE_URL` debe usar el host interno `db`, no `localhost`.
- `JWT_SECRET` requiere al menos 32 caracteres.
- `TOKEN_ENCRYPTION_KEY` requiere 64 caracteres hexadecimales.
- `SEED_PASSWORD` y `SEED_BRIDGE_CLAVE_API` solo son necesarios para sembrar
  datos de desarrollo.

La referencia completa y sin secretos vive en [`.env.example`](.env.example).

### 2. Construir y levantar

```bash
docker compose up --build
```

Compose espera a que la base esté saludable, aplica las migraciones pendientes,
arranca el backend y, cuando este responde, inicia el frontend con recarga en
desarrollo. `db` y `backend` tienen healthcheck; `frontend` no. Cuando Vite
termine de arrancar, abra:

- Aplicación: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Salud: `http://localhost:3000/api/v1/salud`

PostgreSQL no expone un puerto al host. El acceso soportado ocurre desde los
contenedores de Compose.

### 3. Sembrar datos de desarrollo — opcional

Con el stack levantado:

```bash
docker compose exec backend pnpm exec prisma db seed
```

El seed vigente crea cuatro usuarios, uno por rol, y tres bridges inactivos de
prueba: Google Forms, Facebook e Instagram. Las contraseñas provienen de
`SEED_PASSWORD`; el proceso informa las claves generadas que correspondan.

### 4. Ejecutar verificaciones

Todos los comandos se ejecutan dentro de los contenedores:

```bash
docker compose exec backend pnpm test
docker compose exec frontend pnpm test
docker compose exec backend pnpm build
docker compose exec frontend pnpm build
```

### 5. Detener el entorno

```bash
docker compose down
```

El volumen de PostgreSQL se conserva. Para reiniciar desde una base vacía,
use `docker compose down -v` sabiendo que elimina los datos locales.

## Documentación

El mapa canónico de autoridad, estado de confianza y brechas de cada
documento vive en un único lugar:
[`docs/00-estado-documentacion.md`](docs/00-estado-documentacion.md).

Para variables de entorno, comandos de build/test y estructura de carpetas
de cada paquete, ver [`docs/18-desarrollo-local.md`](docs/18-desarrollo-local.md)
— complementa, sin repetir, el flujo Docker de este README.
