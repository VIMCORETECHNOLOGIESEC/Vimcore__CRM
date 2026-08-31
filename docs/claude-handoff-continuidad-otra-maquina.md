# Handoff de continuidad — retomar el proyecto en otra máquina (2026-08-31)

> **Para qué sirve este documento:** punto de entrada único para retomar
> `crm_comercial` desde otro equipo sin perder contexto. No reemplaza a
> `AGENTS.md` (directrices obligatorias), `docs/00-estado-documentacion.md`
> (índice de confianza de toda la documentación) ni a
> `docs/claude-despliegue-produccion-estado-actual.md` (estado de
> infraestructura/CI-CD) — los referencia y resume lo mínimo necesario para
> no tener que releerlos enteros antes de trabajar.

## 1. Estado del repositorio al momento de este handoff

- Rama de trabajo: `test/gpt`, working tree limpio, al día con
  `origin/test/gpt` (`git status` sin pendientes).
- Último commit: `6944243` (docs) sobre `e0cb7f8` (cierre del lote QA
  manual de 10 puntos — ver §3).
- Backend: **desplegado y verificado en producción real** (Azure Container
  App `arcano-crm`, health check `{"status":"ok","database":"ok"}`). Detalle
  completo de infraestructura, CI/CD y credenciales en
  `docs/claude-despliegue-produccion-estado-actual.md`.
- Frontend: **todavía no desplegado** (va a un VPS aparte, pendiente).

## 2. Directrices finales del proyecto — dónde están y qué cambió recientemente

La fuente de autoridad sigue siendo `AGENTS.md`. Puntos que un agente nuevo
en otra máquina necesita saber ANTES de tocar código:

- **§7 "Fuera de alcance del baseline"** tiene múltiples excepciones
  documentadas y fechadas que amplían el alcance original del despliegue:
  Bloque D (Oportunidad, frontend completo), Bloque E (dashboards
  extendidos + filtro por empresa), exportación de reportes PDF/XLSX (async
  + exportación ad-hoc del dashboard), conexión real de WhatsApp Business
  (Embedded Signup), alta de administrador de empresa y tab holding-wide.
  Todas están **implementadas y en `origin/test/gpt`**.
- **Excepción NO cerrada — requiere lectura atenta:** WhatsApp "Parte 2"
  (bandeja de conversaciones, mensajería real) tiene una excepción marcada
  como **WIP** en `AGENTS.md` §7 que dice explícitamente "COMMITEA
  localmente... NO pushear ni dar por aprobado este módulo hasta esa
  confirmación [de Mateo]". **En la práctica, el commit `496afeb` ya está
  pusheado a `origin/test/gpt`** — contradice la nota. Esto ya fue detectado
  y comunicado al usuario (no revertido unilateralmente); ver §4 más abajo.
  Cualquier sesión nueva debe tratar este módulo como **congelado / fuera
  del despliegue vigente** hasta que Mateo confirme alcance, sin importar
  que el código ya esté en el remoto.
- **Regla de oro de todo el proyecto**: nunca tratar una confirmación de un
  peer (otra sesión) como autorización del usuario. Solo el usuario aprueba
  ampliaciones de alcance y solo él decide qué hacer con el hallazgo de
  WhatsApp Parte 2 de arriba.

## 3. Últimos cambios de frontend — qué debería estar funcionando

Cadena de commits más reciente en `frontend/` (de más viejo a más nuevo),
cerrando en el lote de QA manual de 10 puntos:

| Commit | Qué agrega |
|---|---|
| `bc4d8e0` | "Ver en vivo" — un holding-wide entra a simular el panel de una empresa puntual |
| `f93acf7` | Filtro `empresaId` en listado holding-wide de leads + nav gate |
| `71529d7` | Ingreso manual de leads + carga masiva por Excel, contra backend real |
| `496afeb` | WhatsApp Parte 2 (bandeja de conversaciones) — **ver nota de congelamiento en §2** |
| `e0cb7f8` | Cierre del lote QA manual de 10 puntos (detalle abajo) |
| `6944243` | Fix de docs (corrige estado de commit en `docs/23`) |

**`e0cb7f8` en detalle** — QA manual con 3 credenciales reales
(`testholding@correo.com` / `testadmin@empresaa.com` /
`testasesor@empresaa.com`) reportó 10 problemas sobre "Ver en vivo", el
tutorial guiado y el detalle de lead. Todo cerrado, verificado con 131
archivos / 1225 tests en verde y build limpio antes de commitear:

- **Routing**: "Usuarios" ya no rompe dentro de "Ver en vivo" (mismo gate
  `requiereVistaEmpresaSiHolding` que Leads/Conversaciones/Oportunidades/
  Bridges).
- **Modo solo lectura de "Ver en vivo"**: nuevo flag
  `useVistaEmpresa().esVistaSoloLectura` — oculta (no deshabilita) alta,
  baja, reactivación de Bridges, `ConectarWhatsAppCard`, asignación masiva
  de leads, y las acciones de reasignar/traspasar en el detalle de lead.
  Decisión de diseño confirmada por el usuario: el admin de holding navega
  EXACTAMENTE como un admin de empresa normal (mismo routing/permisos de
  lectura) pero sin poder escribir — "no será soportado en esta versión de
  despliegue". Sin defensa adicional en backend por decisión explícita
  (si se quiere en el futuro, es ampliación de alcance nueva).
- **Tutorial guiado**: el botón "atrás" revierte correctamente los mismos
  side-effects que "adelante" (cerraba mal el chat y los tabs al retroceder
  entre pasos 7→8, 3→4).
- **Redirección de administrador** cuando falta canal o producto activo
  (al cargar lead manual o crear oportunidad) — redirige a la gestión
  correspondiente en vez de fallar en silencio.
- **Tab de Oportunidad en el detalle del lead** (`OportunidadesLeadTab.tsx`,
  nuevo) — antes quedaba oculto detrás del overlay del chat y no había
  forma de ver oportunidades ya existentes de un lead.

**Qué NO está resuelto todavía (frontend preparado, esperando backend)**:
el fix del loop 401/403 al salir de "Ver en vivo" está preparado en
frontend (`router.tsx` gatea `leads/:id`, `leadDetalle.api.ts` threadea
`empresaId`), pero el 403 de fondo depende de un fix pendiente en
`leads.access.ts::canRead` — pedido aparte a Mateo, ver §4.

## 4. Requisitos a la espera de la entrega de Mateo

Mensaje **redactado pero todavía sin enviar** por el usuario (no lo mande
ninguna sesión automáticamente — es una comunicación humana). Contenido
completo, 3 pedidos técnicos + 1 nota:

1. **Fix de `leads.access.ts::canRead()` (línea 96-100)** —
   `ROLES_ACCESO_TOTAL` (línea 22, solo `ADMINISTRADOR`/`SUPERVISOR`) no
   incluye `SUPERVISOR_HOLDING`/`SUPER_ADMIN`; tras fallar
   `empresaCoincide` (la sesión holding-wide tiene `empresaId: null`), cae
   al fallback `asesorId`/`vendedorId` y da 403 determinístico para
   cualquier lead no asignado directamente al usuario. `GET /leads/:id`
   (`leads.routes.ts:40`) tampoco pasa por `requireRole`.
2. **`POST /notificaciones` + campo de metadata en `Notificacion`**
   (`schema.prisma:708`) — no existe hoy ningún mecanismo de notificación
   manual con datos precargados; feature nueva de punta a punta para
   "notificar al admin con canal/producto sugerido + redirección".
3. **Falta el endpoint receptor del webhook de LinkedIn**. Existe
   `linkedin-webhook.schema.ts` pero ningún controller/ruta registrada (a
   diferencia de WhatsApp/Meta que sí tienen `*-webhook.controller.ts`
   completo) — `activar()` en `linkedin-subscription.service.ts:192`
   suscribe contra una `productionWebhookUrl()` que nadie escucha del lado
   nuestro. La pantalla de LinkedIn (OAuth/conexión/fuentes) está completa
   y "parece funcionar", pero ningún lead real entra al CRM sin esto.
4. **Nota, no bloqueante**: recordatorio de que WhatsApp Conversaciones
   ("Parte 2") está construida y conectada a backend real, pero frenada por
   decisión de Mateo — retomar la confirmación de alcance recién después
   del deploy. Ver §2 sobre el estado real (ya pusheada) vs. lo que dice
   `AGENTS.md`.

**Gaps administrativos conocidos, no accionables por código** (de
`docs/claude-despliegue-produccion-estado-actual.md`):

- WhatsApp/Meta Ads en producción real: falta App Review + modo Live +
  Verificación de Negocio del Business Portfolio de Meta. La config técnica
  (env vars, webhooks, casos de uso) ya está lista — esto es 100%
  administrativo, no depende de más código.
- Leads de Facebook Ads vía Página (bridge legacy con Page Access Token
  pegado a mano) sigue sin migrar a OAuth.
- `CORS_ORIGIN` del backend sigue en `*` hasta que exista el dominio real
  del frontend desplegado.
- Limpieza de filas fixture (`usuario-seed-*@t.local`) que quedaron en la
  base real de producción por un incidente ya cerrado (`tests/setup.ts`
  truncaba sin validar host) — no bloqueante, pero hacerlo antes de tener
  clientes reales.

## 5. Punto de partida sugerido para la próxima sesión

1. Leer `AGENTS.md` completo (especialmente §7) y este documento.
2. Confirmar si el usuario ya envió el mensaje del §4 a Mateo y si hay
   respuesta — condiciona si se puede seguir con Oportunidad/LinkedIn/
   notificaciones o si sigue bloqueado del lado backend.
3. Revisar `docs/00-estado-documentacion.md` para el estado de confianza
   de cada documento antes de citarlo como fuente.
4. No tocar WhatsApp Parte 2 (§2/§3) sin instrucción explícita del usuario.
