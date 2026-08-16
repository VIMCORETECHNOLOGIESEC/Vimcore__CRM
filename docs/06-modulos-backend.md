# 06 — Módulos backend y checklist de avance

Marca cada casilla al completar el ciclo TDD (RED → GREEN → TRIANGULATE →
REFACTOR) del elemento. Un módulo no está terminado hasta que su columna de
pruebas obligatorias está cubierta.

Estructura por módulo: `routes/ → controllers/ → services/ → repositories/`

---

## M1 — Base e infraestructura

> **Progreso:** implementado en `configuracion-base-monorepo` (PR1
> `feat/configuracion-base-backend`, PR2 `feat/configuracion-base-frontend`),
> verificado PASS con 2 advertencias no bloqueantes (deriva de pnpm entre
> `onlyBuiltDependencies` y `allowBuilds`; reinstalación completa de pnpm en el
> primer arranque del contenedor).

- [x] Monorepo pnpm con workspaces `backend` y `frontend`
- [x] Express + TypeScript con configuración estricta del compilador
- [x] Prisma conectado a PostgreSQL en Docker
- [ ] Esquema inicial completo y primera migración
- [x] Middleware de errores centralizado con clase `AppError`
- [x] Validación con Zod en el borde de cada controller (`auth.controller`;
      `salud.controller` no recibe body/params/query, no aplica — hallazgo H3
      del diseño de `m1-completo-m2-autenticacion`)
- [x] Registro de eventos estructurado (`pino` + `pino-http`, con redacción de
      credenciales y tokens)
- [x] Variables de entorno validadas al arranque; el proceso no inicia si falta una
- [x] Semillas de datos para desarrollo (un usuario `activo=true` por cada rol
      de `RolUsuario`; campañas de prueba quedan para M4, fuera de alcance de
      este cambio)

---

## M2 — Autenticación y usuarios

Desacoplado a propósito: otro equipo integrará el SSO contra esta misma API.

- [x] `POST /api/v1/auth/login` — devuelve JWT de acceso y refresh
- [x] `POST /api/v1/auth/refresh`
- [x] `POST /api/v1/auth/logout`
- [x] `GET /api/v1/auth/perfil`
- [x] Hash de contraseña con argon2id (`@node-rs/argon2`)
- [x] Middleware `requiereAutenticacion` (identificador real: `requireAuthentication`)
- [x] Middleware `requiereRol(...roles)` (identificador real: `requireRole(...roles)`)
- [x] CRUD de usuarios (solo administrador — `requireRole("ADMINISTRADOR")` en los 5 endpoints)
- [ ] Baja lógica de usuario con reasignación obligatoria de su cartera activa
      — **implementado solo en parte**: `DELETE /api/v1/usuarios/:id` sí
      aplica la baja lógica (`activo=false` + revocación de todos sus refresh
      tokens en la misma transacción). La **reasignación obligatoria de la
      cartera activa queda explícitamente fuera de alcance de este cambio**:
      no existe todavía una tabla `leads`/cartera (llega en M5/M6); la casilla
      se deja sin marcar hasta que ese módulo exista y la reasignación pueda
      implementarse de verdad.

**Pruebas obligatorias:** cada endpoint protegido rechaza petición sin token, con
token expirado y con rol insuficiente.

---

## M3 — Normalización y deduplicación

El módulo de mayor riesgo del sistema. Un error aquí corrompe la base de clientes
de forma progresiva y difícil de revertir.

- [x] Normalizador de teléfono a E.164 con país por defecto EC
- [x] Manejo de teléfono no normalizable sin descartar el lead
- [x] Normalizador de correo para comparación, preservando el original
- [x] Resolución de identidad de cliente por teléfono normalizado
- [x] Alta de correo adicional a cliente existente
- [x] Detección de lead abierto y registro de interacción repetida
- [x] Regla de reingreso con ventana de 90 días
- [x] Manejo de `ON CONFLICT` en la inserción de cliente (condición de carrera)

**Pruebas obligatorias:** batería de números en distintos formatos (con y sin
prefijo, con espacios, con guiones, inválidos); dos webhooks simultáneos con el
mismo teléfono producen un solo cliente; lead cerrado hace 89 días no genera
reingreso, hace 91 días sí.

---

## M4 — Ingesta y bridges

> **Progreso:** rebanada parcial implementada en `m4-ingesta-bridges-parcial`
> (endpoint genérico + adaptador Google Forms). Meta, LinkedIn, X, cifrado de
> tokens, CRUD de bridges/cuentas publicitarias y los trabajos programados
> quedan fuera de alcance de este cambio — llegan en un cambio SDD futuro.
>
> **Corrección retroactiva (M5, DD1):** `deduplicacion.service.ts::createLead`
> no poblaba `redSocial`/`payloadOriginal`/`camposDinamicos` en `leads` pese a
> que `LeadEntrante` ya los traía completos — quedaban NULL en todo lead nuevo.
> Corregido en `m5-gestion-leads` PR1 (commit `79f95aa`), con backfill NULL-only
> para leads previos (`camposDinamicos` queda fuera del backfill a propósito,
> ver `migration.sql`). El contrato y los endpoints de M4 no cambiaron.

- [x] Contrato `LeadEntrante` y normalizador compartido
- [x] Tabla `leads_recibidos` con índice único de idempotencia
- [x] Endpoint genérico `POST /api/v1/ingesta/generico` con clave por bridge
- [x] Adaptador Google Forms
- [ ] Adaptador Meta: handshake, verificación de firma, consulta de detalle
- [ ] Adaptador LinkedIn: OAuth, consulta programada, refresco de token
- [ ] Adaptador X sobre el endpoint genérico con atribución UTM
- [ ] Cifrado y descifrado de tokens (AES-256-GCM)
- [ ] CRUD de bridges y cuentas publicitarias
- [x] Registro en `bridge_logs` de todo error de recepción
- [ ] Trabajo programado: verificación de expiración de tokens
- [ ] Trabajo programado: detección de bridge sin actividad por 72 h

**Pruebas obligatorias:** `X-Bridge-Key` ausente, malformada o que no coincide
con ningún bridge activo se rechaza con 401 y registra una fila `bridge_logs`
ERROR (control por clave de API, no firma HMAC — eso es específico del futuro
adaptador Meta, fuera de esta rebanada); el mismo `idExternoLead` dos veces,
incluida entrega concurrente, produce un solo lead; lead sin teléfono ni
correo se persiste con marca de dato incompleto.

---

## M5 — Gestión de leads

- [x] `GET /api/v1/leads` con filtros (etapa, semáforo, red social, campaña,
      responsable, rango de fechas, estado de SLA), paginación y orden
      > **Pendiente (validación server-side faltante):** `leads.schema.ts::listLeadsQuerySchema`
      > (línea 54) valida `limite` como `z.coerce.number().int().min(1).max(100).default(20)`
      > — un rango abierto, no la whitelist acotada (10/25/50/100) que pide el
      > contrato de frontend (`leads.api.ts::LeadsQueryParams.porPagina`). Hoy
      > cualquier entero entre 1 y 100 pasa (p. ej. `limite=37`), así que el
      > servidor no impone el mismo conjunto fijo que usa el cliente. Falta
      > acotar `limite` a esos 4 valores exactos en `leads.schema.ts`.
- [x] Filtrado automático por rol: asesor y vendedor solo ven su cartera
- [x] `GET /api/v1/leads/:id` con verificación de acceso
- [x] `PATCH /api/v1/leads/:id/etapa` con formulario obligatorio
      > **Pendiente (validación server-side faltante):** `leads.service.ts::transitionEtapa`
      > (líneas 134-201) solo rechaza reabrir una etapa terminal (línea 147,
      > `ETAPAS_TERMINALES.includes(lead.etapa)`) pero no valida que `body.etapa`
      > sea una transición válida desde `lead.etapa` — no hay chequeo equivalente
      > a la whitelist de `frontend/src/funcionalidades/leads/etapas.ts::TRANSICIONES_VALIDAS`
      > (progreso lineal Nuevo → Contactado → Cita, nunca se retrocede, más salto
      > directo a cierre desde cualquier etapa no terminal — docs/02-reglas-negocio.md
      > §6). Hoy el endpoint acepta, por ejemplo, `CITA → NUEVO`. Falta agregar esa
      > validación server-side antes de `leadRepository.updateEtapa` (línea 185).
- [x] Validación de campos obligatorios en etapas terminales
- [x] Escritura de `lead_eventos` en la misma transacción que cada cambio
- [x] `GET /api/v1/formularios/:etapa` — definición de formulario
- [x] `POST /api/v1/leads/:id/formulario` — respuestas y cálculo de puntuación
- [x] Motor de cálculo del semáforo con versionado de rúbrica

**Pruebas obligatorias:** un asesor no puede leer ni modificar un lead ajeno
(prueba directa contra el endpoint, no contra la interfaz); cambio de etapa sin
formulario se rechaza; cada combinación de respuestas produce la puntuación
esperada; VENTA sin monto se rechaza.

**Límite M5/M6 (cerrado):** `Lead.asesorId`/`vendedorId` ya existían en el
esquema desde M5 y `leads.service.ts` los consume (filtro de cartera, D4).
M6 aterrizó y es quien los escribe en producción: la asignación automática
por menor carga, la reasignación y el traspaso.

---

## M6 — Asignación, traspaso y SLA

- [x] Algoritmo de asignación por menor carga activa con desempate FIFO
- [x] Asignación automática al persistir lead nuevo o de reingreso
- [x] Manejo del caso sin asesores activos
- [x] `POST /api/v1/leads/:id/asignar` (administrador y supervisor)
- [x] `POST /api/v1/leads/:id/reasignar` con regla de semáforo para el asesor
- [x] `POST /api/v1/leads/:id/traspasar` con selección automática de vendedor
- [x] Reinicio de `sla_inicio_en` en asignación, reasignación y traspaso
- [x] Cálculo derivado del estado de SLA (nunca persistido)
- [x] Trabajo programado cada 15 minutos: detección de leads atrasados

**Pruebas obligatorias:** con cargas 3/1/2 el lead va al asesor de carga 1; con
cargas iguales gana el de asignación más antigua; asesor con lead verde no puede
reasignarlo; el estado de SLA cambia a "En riesgo" exactamente a las 18 h.

**Nota D3 (ancla del SLA):** el criterio de atraso ancla en `sla_inicio_en`, NO en
`ingresado_en` — "24 horas desde su ingreso" en la redacción original de
`docs/02-reglas-negocio.md` §7 es una paráfrasis suelta de "desde la primera
asignación": el reloj arranca al asignar y **se reinicia** en cada reasignación
o traspaso (`sla.calculator.ts` y `slaFilterBoundaries` ya estaban anclados así
desde M5). Un lead sin asignar (`sla_inicio_en = null`) es `sin_iniciar`, nunca
`atrasado` — el cron de M6 lo ignora por completo.

**Nota DD1 (índice del cron):** `idx_leads_sla` (índice parcial `WHERE
cerrado_en IS NULL` sobre `sla_inicio_en`) ya existía desde la migración de M5
(`20260814050000_m5_gestion_leads`); M6 no agrega ningún índice nuevo — el job
de detección de atrasados reutiliza la misma forma de consulta que
`GET /leads?estadoSla=atrasado` de M5.

---

## M7 — Citas

- [x] CRUD de citas asociadas a un lead
- [x] Validación: no se agenda una cita en el pasado
- [x] Reprogramación con registro de evento
- [x] Estados de cita y su efecto en el formulario de la etapa Cita
- [x] Trabajo programado: recordatorio 1 hora antes

**Pruebas obligatorias:** cobertura de integración para el CRUD de citas,
reprogramación y máquina de estados (`citas.service.test.ts`,
`citas.routes.test.ts`), y para el trabajo de recordatorio, incluida su
idempotencia y la guarda de re-entrada (`citas-recordatorio.job.test.ts`).

> **Progreso:** `model Cita` (enums `ModalidadCita`/`EstadoCita`) agregado por
> migración (`20260814220844_m7_citas`), con relaciones a `Lead`/`Usuario`.
> Endpoints: `POST/GET /leads/:id/citas`, `GET /citas/:citaId`,
> `POST /citas/:citaId/cancelar|reprogramar|resultado`. Autorización por
> recurso reutiliza `canRead`/`canEdit` de `leads.access.ts` (D4, M5) sin
> duplicar la regla — mismo criterio que reasignar/traspasar en M6, sin
> `requireRole` fijo en las rutas.
>
> **D-M7a (responsable por defecto):** no existe algoritmo de selección
> automática de responsable para citas (distinto de
> `asignacion.service.ts::selectResponsable`, M6) — fuera del alcance del
> checklist M7. Por defecto, quien agenda es su propio responsable;
> Administrador/Supervisor pueden asignarla a otro usuario explícito
> (mismo patrón DD10 de M6).
>
> **D-M7b (reprogramación, decisión dejada abierta por el diseño del
> cambio):** tras reprogramar, `citas.estado` vuelve a `AGENDADA` con la
> nueva `programadaPara` — **nunca** queda persistido en `REPROGRAMADA` —
> porque el trabajo de recordatorio filtra estrictamente `estado =
> AGENDADA`; dejarlo en `REPROGRAMADA` excluiría para siempre la cita
> reprogramada del recordatorio de la nueva fecha. El valor `REPROGRAMADA`
> se mantiene en el enum por fidelidad exacta con
> `docs/03-modelo-datos.md` §citas, pero ningún camino de código actual lo
> persiste. El historial de reprogramaciones (una o varias) vive en
> `lead_eventos` (`CITA_REPROGRAMADA`, uno por evento), no en `estado`.
>
> **D-M7c (límite con el formulario de etapa CITA, decisión de integración
> pedida explícitamente por el diseño del cambio):** `POST
> /citas/:citaId/resultado` marca `CUMPLIDA`/`NO_ASISTIO` como un registro
> **asociado** al lead — nunca mueve `leads.etapa` ni escribe
> `respuestas_formulario`. El formulario de la etapa CITA
> (`docs/04-formularios-semaforo.md` §5, "¿Asistió a la cita?") lo sigue
> completando el vendedor por su flujo ya existente de M5 (`PATCH
> /leads/:id/etapa` o `POST /leads/:id/formulario`,
> `formularios.service.ts::applyFormulario`) — no se duplica esa lógica ni
> se inventa una segunda fuente de verdad para la misma pregunta. Tampoco
> escribe `lead_eventos`: `TipoEventoLead` solo reserva `CITA_AGENDADA`/
> `CITA_REPROGRAMADA` para M7, `citas.estado` ya es su propio registro
> auditable para el resultado.
>
> **D-M7d (recordatorio, límite explícito con M8):** `citas-recordatorio.job.ts`
> corre cada 15 minutos (mismo patrón de guarda de re-entrada que
> `sla-atrasado.job.ts` de M6) e invoca `enviarRecordatoriosCita`, que marca
> `recordatorio_enviado = true` de forma atómica (`UPDATE ... WHERE
> recordatorio_enviado = false`) para citas `AGENDADA` cuya
> `programada_para` cae en `[ahora, ahora + 1h]`. La emisión real de la
> notificación al responsable y su entrega por SSE son de M8
> (`docs/06-modulos-backend.md` M8, "Servicio de creación de
> notificaciones" / canal SSE), que todavía no existe en el código — este
> job solo deja la marca anti-duplicado y un log estructurado por cita
> (`citas-recordatorio.service.ts`) como punto de enganche documentado, sin
> inventar infraestructura de notificaciones.

---

## M8 — Notificaciones y tiempo real

- [ ] Servicio de creación de notificaciones
- [ ] `GET /api/v1/notificaciones` con filtro de no leídas
- [ ] `PATCH /api/v1/notificaciones/:id/leer` y marcado masivo
- [ ] Canal SSE `GET /api/v1/eventos` autenticado
- [ ] Emisión por SSE de: lead asignado, cambio de etapa, notificación nueva
- [ ] Gestión de conexiones SSE por usuario con limpieza al desconectar
- [ ] Reconexión con `Last-Event-ID`

**Nota de implementación:** mantén el registro de conexiones SSE en memoria del
proceso. Con 100 concurrentes y un solo proceso Node no hace falta Redis ni
sistema de mensajería; introducirlo sería complejidad sin beneficio.

---

## M9 — Dashboard y métricas

- [ ] Servicio de agregación de KPIs (ver `08-dashboard-kpis.md`)
- [ ] `GET /api/v1/metricas/resumen`
- [ ] `GET /api/v1/metricas/por-red-social`
- [ ] `GET /api/v1/metricas/por-asesor`
- [ ] `GET /api/v1/metricas/por-etapa`
- [ ] `GET /api/v1/metricas/por-campania`
- [ ] `GET /api/v1/metricas/embudo`
- [ ] `GET /api/v1/metricas/red-social-x-semaforo` — matriz cruzada
- [ ] Filtro por rango de fechas en todos los endpoints de métricas
- [ ] Alcance por rol: general para administrador y supervisor, personal para
      asesor y vendedor
- [ ] Emisión de actualización de métricas por SSE ante cambios relevantes

**Pruebas obligatorias:** un asesor consultando métricas recibe solo datos de su
cartera; los conteos por etapa suman el total de leads del período.

---

## Orden de ejecución sugerido

```
M1 → M2 → M3 → M4(parcial: genérico + Google Forms) → M5 → M6 → M7 → M8 → M9
                                                              ↓
                                            M4(resto: Meta, LinkedIn, X)
```

Los adaptadores de Meta y LinkedIn se completan al final porque dependen de
aprobaciones externas cuyo tiempo no controlamos. El resto del sistema no debe
quedar bloqueado esperándolas.
