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

## Mapa vivo de documentación

Los estados de esta tabla son orientativos; la autoridad detallada y la fecha
de verificación están en
[`docs/00-estado-documentacion.md`](docs/00-estado-documentacion.md).

| Documento | Uso | Estado de confianza |
|---|---|---|
| [`docs/00-estado-documentacion.md`](docs/00-estado-documentacion.md) | Mapa canónico de autoridad, brechas y lotes de corrección | Vigente |
| [`docs/01-alcance-mvp.md`](docs/01-alcance-mvp.md) | Baseline funcional y exclusiones del MVP v1 | Vigente con reservas |
| [`docs/02-reglas-negocio.md`](docs/02-reglas-negocio.md) | Reglas del embudo, asignación, SLA y traspaso | Vigente con reservas |
| [`docs/03-modelo-datos.md`](docs/03-modelo-datos.md) | Diseño inicial de entidades | **No confiable; usar Prisma** |
| [`docs/04-formularios-semaforo.md`](docs/04-formularios-semaforo.md) | Formularios fijos, rúbrica y cierre | Vigente con reservas |
| [`docs/05-bridges.md`](docs/05-bridges.md) | Contrato funcional de captación | Mixto |
| [`docs/06-modulos-backend.md`](docs/06-modulos-backend.md) | Estado y checklist de M1–M9 | Mixto |
| [`docs/07-modulos-frontend.md`](docs/07-modulos-frontend.md) | Estado y checklist de F1–F8 | Mixto |
| [`docs/08-dashboard-kpis.md`](docs/08-dashboard-kpis.md) | Definición funcional de KPIs | Vigente con reservas |
| [`docs/09-linea-grafica-frontend.md`](docs/09-linea-grafica-frontend.md) | Referencia visual del frontend | Mixto |
| [`docs/09-skills-agentes-backend.md`](docs/09-skills-agentes-backend.md) | Inventario pretendido de skills backend | No confiable |
| [`docs/10-skills-agente-frontend.md`](docs/10-skills-agente-frontend.md) | Inventario de skills frontend | Vigente con reservas |
| [`docs/11-plan-integracion.md`](docs/11-plan-integracion.md) | Snapshot de integración front-back y brechas | Vigente |
| [`docs/12-pruebas-manuales-qa.md`](docs/12-pruebas-manuales-qa.md) | Catálogo histórico de escenarios manuales | **No ejecutable** |
| [`docs/13-configuracion-bridges.md`](docs/13-configuracion-bridges.md) | Operación de bridges Meta y Google Forms | Vigente con reservas |
| [`docs/14-evolucion-multitenant.md`](docs/14-evolucion-multitenant.md) | Arquitectura candidata para holdings y múltiples empresas | Borrador TO-BE |
| [`docs/15-benchmark-crm-y-roadmap.md`](docs/15-benchmark-crm-y-roadmap.md) | Benchmark de CRM y priorización de evolución | Borrador TO-BE |
| [`docs/16-hallazgos-y-preguntas.md`](docs/16-hallazgos-y-preguntas.md) | Entrada ejecutiva entre equipos para revisar hallazgos y decisiones | Vigente para revisión; no contractual |
| [`docs/17-seguridad-y-ciberseguridad.md`](docs/17-seguridad-y-ciberseguridad.md) | Lineamientos de seguridad, uso de `/security-review` y checklist de QA por módulo | Vigente |

Las guías de cada paquete aportan contexto técnico, pero cualquier instrucción
de ejecución en host que todavía contengan queda reemplazada por el flujo Docker
de este README.
