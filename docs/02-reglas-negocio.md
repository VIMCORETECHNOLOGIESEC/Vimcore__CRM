# 02 — Reglas de negocio

Cada regla incluye su comportamiento exacto porque son las que, mal
implementadas, corrompen datos de forma silenciosa.

---

## 1. Normalización del dato de contacto

### 1.1 Teléfono

Es la clave de identidad del cliente. Se normaliza **siempre** antes de comparar
o persistir.

1. Eliminar espacios, guiones, paréntesis y puntos
2. Convertir a formato E.164 con `libphonenumber-js`
3. País por defecto cuando el número llega sin prefijo internacional: **EC (+593)**
4. Si el número no es válido en E.164, el lead **se persiste igualmente** con
   `telefono_valido = false` y se marca en la bitácora del bridge

> No se descarta un lead por teléfono inválido. Es un dato comercial pagado; se
> registra y se señala para que el asesor lo corrija manualmente.

Se guardan dos columnas: `telefono_original` (tal como llegó, para auditoría) y
`telefono_normalizado` (E.164, indexado y único por cliente).

### 1.2 Correo

- Se aplica `trim` y conversión a minúsculas **solo para comparación**
- Se persiste el valor **sin alterar**, porque debe usarse para envío de correos
- Un cliente puede tener varios correos asociados

---

## 2. Deduplicación e identidad del cliente

El modelo separa **cliente** (persona) de **lead** (oportunidad comercial).

```
cliente (telefono_normalizado ÚNICO)
   └── correos_cliente  (1..n)
   └── leads            (1..n oportunidades a lo largo del tiempo)
```

Al recibir un lead entrante:

```
¿Existe cliente con este telefono_normalizado?
├── NO  → crear cliente + crear lead (origen = "nuevo")
└── SÍ  → ¿el correo entrante ya está registrado para ese cliente?
          ├── NO → agregar el correo a correos_cliente
          └── SÍ → no hacer nada con el correo
          ↓
          ¿tiene el cliente un lead ABIERTO?
          (etapa distinta de Venta y No Venta)
          ├── SÍ → NO crear lead nuevo.
          │        Registrar evento "interaccion_repetida" en el lead abierto
          │        y notificar al responsable asignado.
          └── NO → ¿cerró su último lead hace más de 90 días?
                   ├── SÍ → crear lead nuevo (origen = "reingreso")
                   └── NO → registrar evento "interaccion_repetida"
                            en el último lead cerrado, sin reabrirlo
```

**Ventana de reingreso: 90 días, constante fija.** Vive en
`config/negocio.ts` como `VENTANA_REINGRESO_DIAS`. Se dejó fija porque su
configuración por el administrador estaba atada al módulo de remarketing, que es
trabajo futuro.

Un lead con `origen = "reingreso"` entra en etapa **Nuevo** y arranca su ciclo
completo: asignación, SLA y formulario inicial. Es una oportunidad nueva sobre
un cliente conocido, y la interfaz debe distinguirla visualmente.

---

## 3. Asignación automática

Se dispara al persistir un lead nuevo (incluidos los de reingreso).

**Algoritmo — menor carga activa:**

1. Candidatos: usuarios activos con rol `asesor`
2. Carga activa de cada uno = número de leads asignados cuya etapa **no** es
   Venta ni No Venta
3. Gana el de menor carga activa
4. Empate → gana quien lleve más tiempo sin recibir un lead
   (`ultima_asignacion_en` más antigua; nulo cuenta como el más antiguo)
5. Si no hay ningún asesor activo, el lead queda **sin asignar** y se notifica a
   supervisores y administradores

**Sin tope máximo de leads por asesor.** Se confirmó que el control de volumen
se ejerce por tiempos de atención bajo método FIFO, no por límite de cartera.

Al asignar se ejecuta, en una sola transacción: actualizar `lead.asesor_id`,
actualizar `usuario.ultima_asignacion_en`, arrancar el reloj SLA, crear la
notificación y registrar el evento.

---

## 4. Asignación y reasignación manual

| Quién | Puede reasignar | Condición |
|---|---|---|
| Administrador | Cualquier lead | Ninguna |
| Supervisor | Cualquier lead | Ninguna |
| Asesor | Solo los leads que tiene asignados | Si el semáforo **no es verde**, incluido `null` (sin calificar) |
| Vendedor | Ninguno | — |

La restricción del asesor evita que se desprenda de un lead caliente en curso de
cierre. Se valida en el backend; no basta con ocultar el botón.

La reasignación **reinicia el reloj SLA** del lead y notifica al nuevo responsable.

---

## 5. Traspaso asesor → vendedor

> **Riesgo R4 — resuelto en `docs/16` §8.** El cliente confirmó los cuatro
> roles con traspaso, pero no definió el momento exacto en su momento. M6 ya
> implementó la regla AS-IS de esta sección sobre ese supuesto no confirmado;
> la autoridad de cierre (D7), el handoff automático (D8) y las excepciones de
> reasignación (D9) ya están decididos. D0 no cambia este contrato: el cutover
> funcional ocurre en Bloque D post-despliegue y, hasta entonces, manda la regla
> AS-IS documentada en esta sección.

- El traspaso es una **acción explícita** del asesor, no un efecto automático
  del cambio de etapa
- Está habilitada desde la etapa **Contactado** en adelante. Un lead en etapa
  Nuevo no se puede traspasar: el asesor debe hacer primero su acercamiento
- Al traspasar, el sistema elige vendedor por el mismo algoritmo de menor carga
  activa entre usuarios con rol `vendedor`
- Supervisor y administrador pueden elegir vendedor manualmente, pero respetan
  la misma compuerta de etapa: ningún rol puede traspasar un lead en **Nuevo**
- Tras el traspaso: `lead.vendedor_id` queda fijado, el vendedor pasa a ser el
  responsable operativo, y el asesor **conserva visibilidad** del lead
  (es su gestión la que lo originó) pero pierde permiso de edición
- El traspaso reinicia el reloj SLA a nombre del vendedor

**Responsable del lead** = `vendedor_id` si existe, si no `asesor_id`. Toda
lógica de SLA, notificaciones y permisos usa esta definición, no las columnas
por separado.

> **R4/R6 — resuelto en `docs/16` §8 (D5/D6/§8.2).** El modelo AS-IS mantiene
> un único `RolUsuario` por usuario y no representa a una persona que actúa
> como asesor y vendedor, menos aún con alcance distinto por empresa.
> `rolSecundario` fue una alternativa histórica evaluada antes de M6, nunca
> implementada, y queda descartada para el TO-BE porque conserva roles
> globales y no resuelve el alcance multiempresa. El modelo aprobado es la
> jerarquía de membresías usuario↔empresa↔rol de
> [`16-hallazgos-y-preguntas.md`](16-hallazgos-y-preguntas.md) §8.2 — incluye
> autoasignación (D8), conflicto de interés y auditoría (D9). `Empresa` y
> `Membresia` ya existen en Prisma desde Bloque B/C; pendiente el cutover
> funcional en la capa de autorización (routing y autoridad de cierre por
> membresía en vez de `Usuario.rol`), que corresponde a Bloque D.

---

## 6. Etapas del embudo

| # | Etapa | Responsable típico | Terminal |
|---|---|---|---|
| 1 | Nuevo | Asesor | No |
| 2 | Contactado | Asesor | No |
| 3 | Cita | Vendedor | No |
| 4 | Venta | Vendedor | Sí |
| 5 | No Venta | Vendedor | Sí |

- **El progreso es lineal hacia adelante entre las etapas no terminales**
  (Nuevo → Contactado → Cita): nunca se puede retroceder de una etapa no
  terminal a otra anterior. Desde cualquier etapa no terminal se permite el
  salto directo a cierre (Venta o No Venta). Toda transición queda registrada
  en `lead_eventos`.
- Cada cambio de etapa **exige completar el formulario** de la etapa destino
  (ver `04-formularios-semaforo.md`). Sin formulario no hay transición.
- **Venta** exige fecha de cierre y monto.
- **No Venta** exige fecha de cierre y una observación en texto libre con el
  motivo. Sin catálogo categorizado.
- Un lead en etapa terminal **no se reabre**. Si el cliente vuelve a ingresar
  por el embudo, se aplica la regla de reingreso de §2.

---

## 7. SLA de atención

- **Plazo por defecto: 24 horas**, constante `SLA_HORAS` en `config/negocio.ts`
- El reloj arranca en la asignación y **se reinicia** en cada reasignación o traspaso
- El reloj se **detiene** al alcanzar una etapa terminal

**Estados calculados** (nunca persistidos como columna; se derivan del tiempo
transcurrido en cada consulta, para que nunca queden desactualizados):

| Estado | Condición | Presentación |
|---|---|---|
| Sin iniciar | `sla_inicio_en` es nulo; todavía no existe una ventana SLA activa | `Sin iniciar` |
| A tiempo | Queda más del 25 % del plazo | `A tiempo (HH:MM:SS)` |
| En riesgo | Queda 25 % o menos del plazo | `En riesgo (HH:MM:SS)` |
| Atrasado | Plazo vencido | `Atrasado (-HH:MM:SS)` |

Con el plazo por defecto, "En riesgo" comienza a las 18 horas transcurridas.

**Criterio de disparo de alerta vigente:** un lead abierto cuyo
`sla_inicio_en` ocurrió hace 24 horas o más genera una alerta de atraso al
responsable operativo y a los supervisores. El cálculo no usa la fecha de
ingreso ni la última actualización de etapa. Una asignación, reasignación o
traspaso inicia una nueva ventana al actualizar `sla_inicio_en`; un cambio de
etapa por sí solo no reinicia el reloj.

**No hay reasignación automática por atraso.** Se confirmó que el atraso notifica
para que el supervisor decida y aplique el protocolo, no para que el sistema
actúe solo.

---

## 8. Notificaciones

Canal único: **in-app**. La columna `canal` existe en el modelo pero admite un
solo valor válido en el MVP.

| Evento | Destinatario |
|---|---|
| Lead asignado | Responsable del lead |
| Lead traspasado | Vendedor receptor |
| Lead sin atender pasadas 24 h | Responsable + supervisores |
| Lead sin asignar (no hay asesores activos) | Supervisores + administradores |
| Recordatorio de cita | Responsable del lead, 1 hora antes |
| Error de recepción en un bridge | Administradores |
| Token de red social próximo a expirar | Administradores, 7 días antes |

Las notificaciones se entregan por SSE al cliente conectado y se persisten para
que sigan visibles al iniciar sesión.

### Presencia operativa de usuarios

El estado `online`/`offline` de asesores y demás usuarios operativos se deriva
de conexiones SSE activas, no de `Usuario.activo`. `Usuario.activo` sigue
representando baja lógica administrativa.

La presencia vigente se informa en `GET /usuarios` y se actualiza en vivo con el
evento SSE `usuario.presencia-cambiada`. Para el MVP este estado vive en memoria
del backend: ante restart/deploy todos vuelven a verse offline hasta abrir una
nueva conexión. Si el mismo usuario abre varias pestañas, queda online mientras
exista al menos una conexión activa.

---

## 9. Permisos por rol

| Acción | Admin | Supervisor | Asesor | Vendedor |
|---|:--:|:--:|:--:|:--:|
| Ver todos los leads | ✅ | ✅ | ❌ | ❌ |
| Ver sus leads asignados | ✅ | ✅ | ✅ | ✅ |
| Editar formulario de etapa | ✅ | ✅ | Solo suyos | Solo suyos |
| Cambiar etapa | ✅ | ✅ | Solo suyos | Solo suyos |
| Asignar / reasignar cualquiera | ✅ | ✅ | ❌ | ❌ |
| Reasignar los suyos | ✅ | ✅ | Si no está 🟢, incluido sin calificar | ❌ |
| Traspasar a vendedor | ✅ | ✅ | Solo suyos | ❌ |
| Dashboard general | ✅ | ✅ | ❌ | ❌ |
| Dashboard personal | ✅ | ✅ | ✅ | ✅ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |
| Gestionar bridges y tokens | ✅ | ❌ | ❌ | ❌ |

Todo permiso se verifica en el backend por cada petición.

### M8 — Garantías de entrega atómica

Los productores de SLA y citas reclaman cada ventana de elegibilidad de forma
atómica, persisten la notificación junto con el evento o marca que la origina y
publican SSE solo después del commit. `ERROR_BRIDGE` se emite solo junto con una
fila `bridge_logs.ERROR` confirmada.

`TOKEN_POR_EXPIRAR` ✅ implementado (Bloque A, WU5, 2026-08-26): productor idempotente en
`verificacion-token.service.ts::produceAlertaTokenPorExpirar` notifica a administradores 7 días
antes de la expiración, con marker anti-duplicación en `CuentaPublicitaria.alertaExpiracionParaEn`
que se rearma automáticamente al renovar el token. Registrado en `scheduledNotificationProducers`.

---

## 10. Evolución multiempresa y multitenant — TO-BE no aprobado

**Corte vigente (2026-08-28):** Bloques A-C ya cerraron la fundación
multi-tenant en producción (`052e811`, 894/894 tests) — `Empresa`/`Membresia`,
`Bridge.empresaId`/`Lead.empresaId` obligatorios, RLS forzado, `TenantContext`
y CAS optimista. La infraestructura **ya no es single-tenant**. Lo que las
secciones 1 a 9 describen es el **comportamiento funcional** todavía no
scopeado por empresa: asignación por pool global (no por membresía), autoridad
de cierre por `Usuario.rol` legacy (no por membresía/`habilitadoParaVenta`) y
un único `Lead` sin `Oportunidad` separada. Ese cutover funcional queda para
Bloques D (post-despliegue) y F (retiro final de `Usuario.rol`). No deben
interpretarse las secciones 1 a 9 como el contrato definitivo para la
evolución hacia holdings con varias empresas.

Las decisiones D1–D14 (límite de seguridad entre tenant, holding y empresa;
membresías y capacidades por empresa; elegibilidad por membresía de empresa
completa sin sub-filtro por Fuente — D4, `docs/16` §8; responsabilidad de
primer contacto, traspaso y cierre entre asesor y Oportunidad) ya están
**resueltas** en [`16-hallazgos-y-preguntas.md`](16-hallazgos-y-preguntas.md)
§8. La arquitectura candidata completa, con las propuestas de esquema, sigue
en [`14-evolucion-multitenant.md`](14-evolucion-multitenant.md).

Esta referencia **no aprueba ni incorpora** esas reglas al comportamiento
funcional actual: las decisiones están tomadas y la fundación de esquema/
aislamiento (A-C) ya está implementada, pero el cutover de routing, autoridad
y `Oportunidad` sigue pendiente de implementarse en Bloque D antes de
modificar este contrato AS-IS.
