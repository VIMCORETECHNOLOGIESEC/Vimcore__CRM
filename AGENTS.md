# AGENTS.md — CRM Embudo de Leads

Instrucciones para agentes de IA (Gentle-AI / SDD) que trabajen en este repositorio.
Léelo completo antes de cualquier fase SDD.

---

## 1. Qué es este proyecto

CRM comercial de gestión de leads captados desde campañas publicitarias en redes
sociales. Recibe leads por webhook, los deduplica, los asigna a personal comercial
y sigue su avance por un embudo de 5 etapas hasta la venta o el cierre negativo.

**Modelo de despliegue: instancia única por empresa. NO es multi-tenant.**
No existe tabla `tenant_id`, no existe scoping por empresa, no existe
super-administrador. Cada cliente recibe su propio despliegue aislado con su
propia base de datos. Si una tarea parece requerir aislamiento por empresa,
está mal entendida — detente y pregunta.

**Alcance MVP: formato fijo, no personalizable.** Los formularios de seguimiento,
las reglas de puntuación del semáforo, las etapas y los tiempos de SLA están
definidos en código y en `docs/`, no en base de datos configurable por el
administrador. La personalización es trabajo futuro explícitamente excluido.

---

## 2. Stack

| Capa | Tecnología | Nota |
|---|---|---|
| Frontend | React + TypeScript + Tailwind CSS | Web responsive, sin app nativa |
| Backend | Node.js + Express + TypeScript | API REST + SSE |
| Base de datos | PostgreSQL | Docker en desarrollo |
| ORM | Prisma | Code-first, migraciones versionadas |
| Gestor de paquetes | **pnpm** | Obligatorio. Nunca npm ni yarn — ver §2.1 |
| Tiempo real | SSE (Server-Sent Events) | Unidireccional servidor→cliente |
| Entorno de ejecución | Contenedor / VM | Obligatorio. Ver §2.2 |
| Idioma de la interfaz | Español | Único idioma soportado |

### 2.1 Gestor de paquetes: pnpm obligatorio

**Toda instalación, ejecución de scripts y build usa `pnpm`.** No es una
preferencia de estilo: responde a los incidentes de seguridad en la cadena de
suministro del registro npm — paquetes comprometidos, typosquatting y scripts de
post-instalación maliciosos que se propagan por dependencias transitivas.

Reglas para los agentes:

- Nunca ejecutes `npm install`, `npm run`, `npx`, `yarn` ni `bun` en este
  repositorio. El equivalente de `npx` es `pnpm dlx`.
- El repositorio versiona **`pnpm-lock.yaml`**. No debe existir `package-lock.json`
  ni `yarn.lock`; si aparece uno, es un error a reportar, no un archivo a ignorar.
- Instala siempre con `pnpm install --frozen-lockfile` en CI y en contenedores.
  Un `install` que modifica el lockfile durante un build es exactamente el
  vector que se busca evitar.
- Fija la versión de pnpm en `package.json` mediante el campo `packageManager`.
- No agregues una dependencia nueva sin declararlo en el artefacto SDD de la
  fase. Cada dependencia es superficie de ataque heredada.
- Ante una dependencia con script de post-instalación, decláralo explícitamente
  en el `proposal.md` antes de incorporarla.

### 2.2 Ejecución y despliegue en contenedor

**Todo se ejecuta dentro de contenedor o máquina virtual: desarrollo, pruebas,
base de datos y despliegue.** Nada se instala ni se ejecuta directamente sobre
la máquina anfitriona.

El motivo es el modo de trabajo del proyecto. Claude Code opera en
**Bypass Permissions**, donde no solicita aprobación antes de ejecutar comandos
potencialmente destructivos. La propia advertencia de la herramienta indica que
ese modo debe usarse únicamente en un contenedor o VM aislado, con acceso a
internet restringido y fácil de restaurar si resulta dañado. El aislamiento es
la única red de seguridad activa: si un comando destruye el entorno, se
reconstruye el contenedor y no se pierde nada del anfitrión.

Reglas para los agentes:

- El entorno de desarrollo se levanta con `docker compose up`. Un `README` que
  pida instalar Node o PostgreSQL en el anfitrión está mal escrito.
- **Nunca** propongas ni ejecutes comandos que actúen fuera del árbol del
  proyecto: instalaciones globales en el anfitriano, modificación de `~/.bashrc`
  o `~/.zshrc`, cambios de configuración del sistema operativo.
- Todo estado persistente vive en volúmenes declarados en `docker-compose.yml`.
  El contenedor debe poder destruirse y recrearse sin pérdida de datos de
  desarrollo.
- Salida de red restringida: solo el registro de paquetes y las APIs de las
  plataformas publicitarias necesarias. Si una tarea requiere alcanzar un
  dominio nuevo, decláralo en el artefacto SDD en lugar de abrir el acceso.
- Las credenciales entran por variables de entorno desde un `.env` **no
  versionado**. Nunca escribas un token, clave o contraseña real en el
  repositorio, ni siquiera en un archivo de ejemplo.
- Imágenes base fijadas por versión, nunca `:latest`. Un build reproducible es
  parte del control de la cadena de suministro.

**Archivos esperados en la raíz:** `docker-compose.yml`, `Dockerfile` para
backend y frontend, `.dockerignore` y `.env.example` con las claves sin valores.

### Estructura del monorepo

```
/
├── backend/          APIs, lógica de bridges, jobs
├── frontend/         GUI web
├── docs/             Documentación funcional (fuente de verdad del negocio)
├── openspec/         Artefactos SDD generados por fase
├── AGENTS.md
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
└── pnpm-lock.yaml    Versionado. No debe existir package-lock.json ni yarn.lock
```

---

## 3. Reglas para el orquestador y sub-agentes

1. **`docs/` es la fuente de verdad funcional.** Antes de proponer o diseñar,
   lee el documento correspondiente. Si tu propuesta contradice `docs/`, la
   contradicción es un hallazgo que debes reportar, no una licencia para
   improvisar.
2. **No inventes requisitos.** Si un detalle no está en `docs/` ni en el
   `proposal.md` de la fase, decláralo como pregunta abierta en el artefacto,
   no lo resuelvas con un supuesto silencioso.
3. **El orquestador no escribe código.** Coordina, delega y verifica los
   resúmenes de los sub-agentes.
4. **Idioma:** artefactos SDD (proposal, spec, design, tasks) en inglés.
   Comentarios de código, mensajes de commit y textos de interfaz en español.
   Identificadores de código: estructura en inglés (verbos, tipos, sufijos
   técnicos como `Id`, `At`, `Params`) combinada con sustantivos de dominio de
   negocio en español cuando el término ya está establecido en `docs/` — p. ej.
   `TelefonoNormalizado`, `normalizeTelefono`, `VENTANA_REINGRESO_DIAS`,
   `usuarioId`, `revocadoEn`. No traduzcas vocabulario de negocio sin
   equivalente asentado en el proyecto; usa inglés puro para infraestructura
   genérica sin carga de dominio (`AppError`, `requireAuthentication`,
   `PrismaClientOrTransaction`).
5. **Todo cambio de esquema pasa por una migración Prisma.** Nunca edites la
   base de datos directamente.

---

## 4. Convenciones de código

### Backend

- Arquitectura por capas: `routes → controllers → services → repositories`.
  La lógica de negocio vive en `services`. Los controllers solo validan entrada
  y traducen la salida a HTTP.
- Validación de entrada con **Zod** en el borde (controller). Nunca confíes en
  el payload de un webhook externo.
- Errores: clase `AppError` con código de dominio + middleware central. Nunca
  devuelvas un stack trace al cliente.
- Toda operación que cambie estado de un lead escribe un registro en
  `lead_eventos` dentro de la **misma transacción**.

### Frontend

- Componentes funcionales, hooks, sin componentes de clase.
- Estado de servidor con **TanStack Query**; estado local con `useState`/`useReducer`.
  No introduzcas Redux.
- Formularios con **React Hook Form + Zod**, reutilizando los esquemas del backend.
- Tailwind con clases utilitarias directas. Sin CSS-in-JS.

### Nomenclatura

- Tablas y columnas en PostgreSQL: `snake_case`, plural para tablas.
- TypeScript: `camelCase` para variables, `PascalCase` para tipos y componentes.
- Endpoints REST: `/api/v1/recurso-en-plural`, kebab-case.

---

## 5. Testing (TDD estricto)

Comando de test: `pnpm test`

El ciclo obligatorio en las fases `apply` y `verify` es
**RED → GREEN → TRIANGULATE → REFACTOR**, con evidencia registrada.

Cobertura mínima exigida por módulo:

- **Obligatorio con test unitario:** normalización de teléfono, deduplicación,
  cálculo del semáforo, cálculo de SLA, algoritmo de asignación por carga.
  Estas cinco son las reglas donde un error silencioso corrompe datos.
- **Obligatorio con test de integración:** cada endpoint de ingesta de bridge,
  cada transición de etapa, el traspaso asesor→vendedor.
- **No exigido:** componentes de presentación sin lógica.

---

## 6. Seguridad

- HTTPS obligatorio en producción. Certificados SSL gestionados en el despliegue.
- Contraseñas con `argon2id`. Nunca bcrypt con configuración por defecto.
- Tokens de redes sociales cifrados en reposo (AES-256-GCM, clave en variable de
  entorno). **Nunca** se devuelven en una respuesta de API, ni siquiera
  parcialmente; la interfaz muestra solo estado y fecha de expiración.
- Verificación de firma en todos los webhooks entrantes (`X-Hub-Signature-256`
  en Meta y su equivalente en cada proveedor). Un webhook sin firma válida se
  descarta y se registra.
- Autorización verificada en el **backend** en cada endpoint. El filtrado por rol
  en el frontend es cosmético y no cuenta como control de acceso.
- Cadena de suministro y aislamiento del entorno: aplican las reglas de §2.1
  (pnpm obligatorio, lockfile congelado) y §2.2 (ejecución exclusiva en
  contenedor con red restringida).

---

## 7. Fuera de alcance — no lo implementes

Estos elementos fueron excluidos deliberadamente. Si una tarea parece pedirlos,
verifica antes de construir:

- Multi-tenant, super-administrador, panel matriz entre empresas
- Personalización de formularios, etapas o reglas de puntuación por el administrador
- Módulo de remarketing
- Exportación a Excel o PDF (solo se deja el punto de extensión documentado)
- Integración con calendarios externos (Google Calendar, Outlook)
- Notificaciones por correo, SMS o WhatsApp (solo in-app)
- App móvil nativa
- Bridges de TikTok y sitio web propio (arquitectura preparada, no implementados)
- Timeline cronológico de interacciones en la vista de detalle del lead
- SSO / OAuth corporativo (se expone la API para integrarlo después)

---

## 8. Documentos de referencia

| Documento | Contenido |
|---|---|
| `docs/01-alcance-mvp.md` | Qué entra y qué no, con justificación |
| `docs/02-reglas-negocio.md` | Deduplicación, asignación, SLA, traspaso, reingreso |
| `docs/03-modelo-datos.md` | Entidades, relaciones, invariantes |
| `docs/04-formularios-semaforo.md` | Formularios por etapa y rúbrica de puntuación |
| `docs/05-bridges.md` | Contrato de ingesta y particularidades por red |
| `docs/06-modulos-backend.md` | Módulos backend con checklist de avance |
| `docs/07-modulos-frontend.md` | Módulos frontend con checklist de avance |
| `docs/08-dashboard-kpis.md` | Definición exacta de cada KPI |
