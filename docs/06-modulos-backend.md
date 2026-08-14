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

- [ ] `GET /api/v1/leads` con filtros (etapa, semáforo, red social, campaña,
      responsable, rango de fechas, estado de SLA), paginación y orden
- [ ] Filtrado automático por rol: asesor y vendedor solo ven su cartera
- [ ] `GET /api/v1/leads/:id` con verificación de acceso
- [ ] `PATCH /api/v1/leads/:id/etapa` con formulario obligatorio
- [ ] Validación de campos obligatorios en etapas terminales
- [ ] Escritura de `lead_eventos` en la misma transacción que cada cambio
- [ ] `GET /api/v1/formularios/:etapa` — definición de formulario
- [ ] `POST /api/v1/leads/:id/formulario` — respuestas y cálculo de puntuación
- [ ] Motor de cálculo del semáforo con versionado de rúbrica

**Pruebas obligatorias:** un asesor no puede leer ni modificar un lead ajeno
(prueba directa contra el endpoint, no contra la interfaz); cambio de etapa sin
formulario se rechaza; cada combinación de respuestas produce la puntuación
esperada; VENTA sin monto se rechaza.

---

## M6 — Asignación, traspaso y SLA

- [ ] Algoritmo de asignación por menor carga activa con desempate FIFO
- [ ] Asignación automática al persistir lead nuevo o de reingreso
- [ ] Manejo del caso sin asesores activos
- [ ] `POST /api/v1/leads/:id/asignar` (administrador y supervisor)
- [ ] `POST /api/v1/leads/:id/reasignar` con regla de semáforo para el asesor
- [ ] `POST /api/v1/leads/:id/traspasar` con selección automática de vendedor
- [ ] Reinicio de `sla_inicio_en` en asignación, reasignación y traspaso
- [ ] Cálculo derivado del estado de SLA (nunca persistido)
- [ ] Trabajo programado cada 15 minutos: detección de leads atrasados

**Pruebas obligatorias:** con cargas 3/1/2 el lead va al asesor de carga 1; con
cargas iguales gana el de asignación más antigua; asesor con lead verde no puede
reasignarlo; el estado de SLA cambia a "En riesgo" exactamente a las 18 h.

---

## M7 — Citas

- [ ] CRUD de citas asociadas a un lead
- [ ] Validación: no se agenda una cita en el pasado
- [ ] Reprogramación con registro de evento
- [ ] Estados de cita y su efecto en el formulario de la etapa Cita
- [ ] Trabajo programado: recordatorio 1 hora antes

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
