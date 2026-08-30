# AGENTS.md — CRM Embudo de Leads

Instrucciones para agentes de IA (Gentle-AI / SDD) que trabajen en este repositorio.
Léelo completo antes de cualquier fase SDD.

---

## 1. Qué es este proyecto

CRM comercial de gestión de leads captados desde campañas publicitarias en redes
sociales. Recibe leads por webhook, los deduplica, los asigna a personal comercial
y sigue su avance por un embudo de 5 etapas hasta la venta o el cierre negativo.

**Baseline vigente (AS-IS, actualizado 2026-08-28): fundación multi-tenant
implementada, comportamiento funcional aún equivalente a single-company.**
Bloques A, B y C de la migración multi-tenant (`docs/blocks/`) ya están
**cerrados e implementados en producción** (`052e811`, 894/894 tests):
existen `Empresa`/`Membresia` en el esquema, Row-Level Security de Postgres
forzado (rol `crm_app` sin `BYPASSRLS`), contexto de tenant obligatorio por
request (`AsyncLocalStorage`) y CAS optimista en asignación. Esto **no** es
"un despliegue aislado con su propia base de datos por cliente" — es un
esquema compartido con aislamiento real por fila. Lo que sigue siendo
equivalente a single-company es el **comportamiento funcional visible**: el
pool de asignación sigue global (sin scope por empresa), la autoridad de
cierre sigue leyendo `Usuario.rol` legacy, y no hay superadministrador de
holding operativo. Todo mantenimiento del producto debe preservar el
comportamiento funcional actual (no introducir routing o autorización por
empresa fuera de un bloque aprobado) sin asumir que el esquema físico
tampoco cambió — sí cambió.

**Evolución pendiente: routing, autoridad de cierre y dashboards por
empresa.** Las decisiones D1-D14 (frontera tenant, membresías, roles,
routing, Oportunidad, dashboards, integraciones compartidas) ya están
**resueltas** en `docs/16-hallazgos-y-preguntas.md` §8 y desglosadas por
bloque de implementación en `docs/blocks/`. Bloque D0 (visualización mínima
de la separación por empresa en frontend) se ejecuta antes del despliegue;
Bloque D completo (routing, autoridad de cierre, Oportunidad) y Bloque E
(dashboards) quedan diferidos a después del despliegue; Bloque F (retiro de
`Usuario.rol`) tiene además una dependencia de secuencia dura — solo después
de congelar o mergear el trabajo de `dev-back`/`dev-front` sobre ese mismo
enum, nunca en paralelo. No crear entidades de tenant, membresías, roles
globales ni cambios de autorización fuera de la SDD change del bloque
correspondiente (`docs/blocks/{a..f}-*.md`). Nunca documentar el TO-BE como
si describiera el comportamiento actual, y nunca documentar el AS-IS como si
la infraestructura multi-tenant no existiera — ambos errores ya ocurrieron
en este documento.

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
├── AGENTS.md
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
└── pnpm-lock.yaml    Versionado. No debe existir package-lock.json ni yarn.lock
```

No hay directorio `openspec/` en este repo: los artefactos SDD (proposal,
spec, design, tasks, apply-progress, verify) se persisten en Engram, no en
archivos versionados — ver `sdd-init/crm_comercial` y el ejemplo de
`docs/blocks/c-aislamiento.md`.

---

## 3. Reglas para el orquestador y sub-agentes

1. **Comienza por `docs/00-estado-documentacion.md`.** `docs/` es la fuente de
   verdad funcional dentro de la autoridad declarada para cada archivo. Cuando
   el mapa marque un documento como mixto o no confiable, el código, Prisma y
   las migraciones son la autoridad para describir el AS-IS. Toda contradicción
   debe reportarse y resolverse; no es una licencia para improvisar.
   Para una revisión cruzada entre equipos, usa
   `docs/16-hallazgos-y-preguntas.md` como entrada ejecutiva: sus hallazgos y
   decisiones pendientes están vigentes para revisión, pero no constituyen un
   contrato ni autorizan cambios de implementación.
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

## 7. Fuera de alcance del baseline — no lo implementes sin aprobación

Estos elementos no forman parte del producto single-company vigente. Pueden
analizarse como evolución, pero requieren alcance y aprobación explícitos antes
de modificar código, datos o despliegue:

- Routing por empresa, autoridad de cierre por membresía, Oportunidad,
  dashboards jerárquicos y superadministrador de holding operativo — D1-D14
  resueltas en `docs/16` §8; la fundación (`Empresa`/`Membresia`/RLS/contexto
  de tenant) ya está implementada por Bloques A-C, pero este comportamiento
  funcional sigue diferido a Bloques D0/D/E/F (ver `docs/blocks/`). No crear
  routing, autorización o dashboards por empresa fuera de la SDD change del
  bloque correspondiente
- Personalización de formularios, etapas o reglas de puntuación por el administrador
- Módulo de remarketing
- Exportación a Excel o PDF (solo se deja el punto de extensión documentado)
- Integración con calendarios externos (Google Calendar, Outlook)
- Notificaciones por correo, SMS o WhatsApp (solo in-app)
- App móvil nativa
- Bridges de TikTok y sitio web propio (no implementados ni modelados como
  canales; el endpoint genérico actual registra el origen como `GOOGLE_FORMS`)
- Timeline cronológico de interacciones en la vista de detalle del lead
- SSO / OAuth corporativo (se expone la API para integrarlo después)

---

## 8. Documentos de referencia

El índice completo de documentos, su estado de confianza y su autoridad
declarada vive en un único lugar: `docs/00-estado-documentacion.md`. Para
variables de entorno, comandos y estructura de carpetas, ver
`docs/18-desarrollo-local.md`. No se duplica esa tabla acá.

---

## 9. Skills de agentes de IA

Antes de instalar o usar una skill de Claude Code para trabajo en `backend/**`
o `frontend/**`, se aplica la misma barra de confianza que a una dependencia
de npm (§2.1 — cadena de suministro): procedencia verificable (vendor oficial
o repo de GitHub inspeccionable con autor y licencia identificables), nunca un
agregador que liste variaciones duplicadas del mismo tema sin mantenedor
claro. El detalle por skill — fuente, comando de instalación y en qué caso
concreto debe usarla el agente — vive en `docs/21-skills-agentes-backend.md`
(backend) y `docs/10-skills-agente-frontend.md` (frontend); esos documentos
también registran las skills evaluadas y descartadas, para no repetir la
evaluación.

---

## 10. Graphify — grafo arquitectónico del proyecto

Graphify complementa a CodeGraph; no lo reemplaza. El grafo derivado vive en
`graphify-out/` dentro de cada worktree, está ignorado por Git y nunca se copia,
commitea ni mergea entre ramas. La instalación, generación y diagnóstico se
documentan en `docs/20-graphify-context-graph.md`.

### Cuándo usar cada herramienta

- **CodeGraph sigue siendo la primera parada obligatoria** para símbolos
  puntuales, call paths y blast radius.
- Usar Graphify para orientación arquitectónica, comunidades y hubs; consultas
  que atraviesen servicios; migraciones Prisma/SQL; o exploración visual.
- Para un módulo recién modificado, comprobar primero que el grafo del worktree
  está actualizado. Un grafo de otro worktree no es evidencia válida.

### Disciplina de actualización

- Después de cambios reales de código, ejecutar desde la raíz del worktree
  `graphify extract . --code-only`.
- Usar `--force` solo si quedaron archivos sin indexar o se agregó una gramática.
- No ejecutar `graphify extract ./docs` ni `cluster-only` sin `--no-label` salvo
  pedido explícito o checkpoint de archivo SDD: ambos pueden consumir tokens LLM.
- Las comunidades se calculan localmente; sus nombres legibles son un labeling
  opcional y costoso.

### Integración con OpenCode

OpenCode carga este `AGENTS.md`; no necesita un archivo de instrucciones
Graphify adicional. El MCP local se registra manualmente con
`type: "local"` y `command: ["graphify-mcp"]`, se ejecuta desde la raíz del
worktree y requiere que el extra `graphifyy[mcp]` esté instalado en el mismo
entorno aislado. Los cambios de configuración o instrucciones requieren
reiniciar OpenCode.

Nunca ejecutar `graphify install`, `graphify opencode install`,
`graphify claude install`, `graphify hook install` ni `graphify uninit`: esos
comandos sobrescriben instrucciones, instalan hooks o modifican el ciclo de vida
fuera de la integración manual aprobada.
