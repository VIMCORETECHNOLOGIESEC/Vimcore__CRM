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
| Asesor | Solo los leads que tiene asignados | Solo si el semáforo es **rojo o amarillo** |
| Vendedor | Ninguno | — |

La restricción del asesor evita que se desprenda de un lead caliente en curso de
cierre. Se valida en el backend; no basta con ocultar el botón.

La reasignación **reinicia el reloj SLA** del lead y notifica al nuevo responsable.

---

## 5. Traspaso asesor → vendedor

> **Supuesto explícito (riesgo R4).** El cliente confirmó los cuatro roles con
> traspaso, pero no definió el momento exacto. Esta es la regla adoptada;
> validar antes de la fase `apply`.

- El traspaso es una **acción explícita** del asesor, no un efecto automático
  del cambio de etapa
- Está habilitada desde la etapa **Contactado** en adelante. Un lead en etapa
  Nuevo no se puede traspasar: el asesor debe hacer primero su acercamiento
- Al traspasar, el sistema elige vendedor por el mismo algoritmo de menor carga
  activa entre usuarios con rol `vendedor`
- Supervisor y administrador pueden traspasar en cualquier momento y elegir
  vendedor manualmente
- Tras el traspaso: `lead.vendedor_id` queda fijado, el vendedor pasa a ser el
  responsable operativo, y el asesor **conserva visibilidad** del lead
  (es su gestión la que lo originó) pero pierde permiso de edición
- El traspaso reinicia el reloj SLA a nombre del vendedor

**Responsable del lead** = `vendedor_id` si existe, si no `asesor_id`. Toda
lógica de SLA, notificaciones y permisos usa esta definición, no las columnas
por separado.

---

## 6. Etapas del embudo

| # | Etapa | Responsable típico | Terminal |
|---|---|---|---|
| 1 | Nuevo | Asesor | No |
| 2 | Contactado | Asesor | No |
| 3 | Cita | Vendedor | No |
| 4 | Venta | Vendedor | Sí |
| 5 | No Venta | Vendedor | Sí |

- **El orden es sugerido, no obligatorio.** El sistema permite avanzar, saltar y
  retroceder libremente. Toda transición queda registrada en `lead_eventos`.
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
| A tiempo | Queda más del 25 % del plazo | `A tiempo (HH:MM:SS)` |
| En riesgo | Queda 25 % o menos del plazo | `En riesgo (HH:MM:SS)` |
| Atrasado | Plazo vencido | `Atrasado (-HH:MM:SS)` |

Con el plazo por defecto, "En riesgo" comienza a las 18 horas transcurridas.

**Criterio de disparo de alerta:** un lead sin actualización de etapa durante más
de 24 horas desde su ingreso genera alerta de atraso al responsable y a los
supervisores.

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

---

## 9. Permisos por rol

| Acción | Admin | Supervisor | Asesor | Vendedor |
|---|:--:|:--:|:--:|:--:|
| Ver todos los leads | ✅ | ✅ | ❌ | ❌ |
| Ver sus leads asignados | ✅ | ✅ | ✅ | ✅ |
| Editar formulario de etapa | ✅ | ✅ | Solo suyos | Solo suyos |
| Cambiar etapa | ✅ | ✅ | Solo suyos | Solo suyos |
| Asignar / reasignar cualquiera | ✅ | ✅ | ❌ | ❌ |
| Reasignar los suyos | ✅ | ✅ | Solo 🔴/🟡 | ❌ |
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

`TOKEN_POR_EXPIRAR` permanece en el contrato, pero su productor queda diferido
al alcance restante de M4. M8 no infiere fechas de expiración mientras no
existan almacenamiento cifrado y `token_expira_en`.
