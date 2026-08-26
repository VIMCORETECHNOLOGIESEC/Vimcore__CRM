# 12 — Pruebas manuales de QA

> **Estado documental: No confiable — revalidación en Bloque A.**
>
> **Autoridad operativa actual:** `backend/prisma/seed.ts`,
> `backend/prisma/seed-leads-qa.ts` y el estado real de la base recreada.
>
> **Verificado contra:** rama `test/gpt`, commit `e70b3a4`, 2026-08-25.
>
> Los datos de partida descritos abajo no coinciden con los seeds actuales:
> el seed base crea 4 usuarios y 3 bridges; el seed auxiliar crea 10 leads y
> no crea las 5 citas ni las 18 notificaciones que este documento presupone.
> La contraseña proviene de `SEED_PASSWORD`, no de un valor fijo garantizado.
> Este archivo puede consultarse como catálogo histórico de escenarios, pero
> **no debe usarse para aprobar QA** hasta reconstruir fixtures y resultados
> esperados de forma reproducible (ver
> [`00-estado-documentacion.md`](00-estado-documentacion.md), lote 4).

Checklist de pruebas manuales exhaustivas contra el ambiente Docker de
desarrollo ya levantado (`docker compose up -d`) y con los datos de semillas
ya cargados. Pensado para que una persona sin conocimiento técnico profundo
pueda sentarse frente a `http://localhost:5173` y verificar el sistema
completo, paso a paso, con datos reales del ambiente.

No repite el contrato técnico de cada endpoint (ver
[`06-modulos-backend.md`](06-modulos-backend.md) y el código en
`backend/src/routes/`) ni la configuración de bridges (ver
[`13-configuracion-bridges.md`](13-configuracion-bridges.md)) — se enfoca en
"hacer clic acá, esperar este resultado".

---

## 0. Datos de partida del ambiente

No inventes otros datos al ejecutar estos casos — son los reales del seed y
de la carga de prueba ya aplicada sobre este ambiente.

**URLs:** frontend `http://localhost:5173`, API `http://localhost:3000/api/v1`.

**Usuarios** (contraseña `DevSeedPass123` para los cinco):

| Correo | Rol |
|---|---|
| `admin@crm.local` | ADMINISTRADOR |
| `supervisor@crm.local` | SUPERVISOR |
| `asesor@crm.local` | ASESOR |
| `asesor2@crm.local` | ASESOR (creado para probar reasignación) |
| `vendedor@crm.local` | VENDEDOR |

**Bridges:** 1 bridge Google Forms ("Google Forms (pruebas)"), sembrado
`INACTIVO`. Clave de API = valor de `SEED_BRIDGE_CLAVE_API` del `.env` del
contenedor `backend`:

```bash
docker compose exec backend sh -c 'echo $SEED_BRIDGE_CLAVE_API'
```

**Leads (13):** 4 en NUEVO (Ana Vega, Carlos Ruiz, Maria Torres, y un cuarto
lead sin nombre fijado en este documento — identificalo filtrando
`etapa = NUEVO` en `/leads`), 1 en CONTACTADO, 4 en CITA, 2 en VENTA (Camila
Herrera, $1250.50, crédito; Luis Castro, $890, contado), 2 en NO_VENTA
(Miguel Chávez, Diego Suárez).

**Citas (5):** Roberto Paredes — AGENDADA, virtual, lead traspasado a
vendedor; Paola Zambrano — AGENDADA, presencial, ya fue reprogramada una vez;
Camila Herrera — CUMPLIDA; Miguel Chávez — NO_ASISTIO; Valeria Ortiz —
CANCELADA.

**Notificaciones (18):** 14 `LEAD_ASIGNADO` para `asesor@crm.local`, 3 para
`asesor2@crm.local`, 1 `LEAD_TRASPASADO` para `vendedor@crm.local`.

**Gaps conocidos — no reportarlos como defecto, ya documentados en
`07-modulos-frontend.md`:**

- No existen tabs "Pendientes"/"Cerrados" en `/leads` — el listado muestra
  todas las etapas mezcladas, sin filtro de "vista" (depende del parámetro
  `vista` de `GET /leads`, sin implementar en el backend).
- No hay ingesta soportada para LinkedIn ni X — solo Meta y Google Forms
  aceptan leads reales hoy.
- No hay autoservicio de cambio de contraseña para roles distintos de
  administrador (`/perfil` responde 403 para supervisor/asesor/vendedor); el
  único camino funcional es que un administrador restablezca la contraseña
  desde `/usuarios`.
- La actualización SSE de `/leads` y del detalle de un lead solo llega a la
  sesión del usuario destinatario directo del evento (`lead.asignado`/
  `lead.etapa-cambiada`), no a un tercero (ej. un supervisor mirando el
  listado) — un ingreso sin asignación exitosa tampoco refresca ninguna
  sesión, porque no existe el evento `lead.nuevo`.
- El formulario de etapa y los botones de cierre en `/leads/:id` no ocultan
  proactivamente los controles cuando el usuario ya perdió permiso de
  edición (ej. asesor tras traspasar su lead) — el backend rechaza con 403,
  pero el frontend muestra el error genérico en vez de ocultar el control.

---

## 1. Acceso y autenticación

### 1.1 — Login exitoso por cada rol

**Precondición:** sesión cerrada (`http://localhost:5173/iniciar-sesion`).

**Pasos:**
1. Cargar `http://localhost:5173` (redirige a `/iniciar-sesion` si no hay
   sesión).
2. Ingresar correo y contraseña de uno de los cinco usuarios del seed (§0).
3. Hacer clic en **Iniciar sesión**.

**Resultado esperado:** redirección a `/panel` (landing común a los cuatro
roles hoy). El menú lateral refleja el rol: **Usuarios** y **Bridges** solo
son visibles para `admin@crm.local`.

Repetir con los cinco usuarios.

### 1.2 — Credenciales incorrectas

**Pasos:**
1. En `/iniciar-sesion`, ingresar `admin@crm.local` con una contraseña
   incorrecta.
2. Enviar.

**Resultado esperado:** alerta "No se pudo iniciar sesión" con mensaje
"Correo o contraseña incorrectos" (mismo mensaje si el correo no existe —
sin oráculo de cuentas). Backend: `401 credenciales_invalidas`. La sesión no
se abre.

### 1.3 — Refresh de sesión

**Precondición:** sesión iniciada.

**Pasos:**
1. Iniciar sesión con cualquier usuario.
2. Recargar la página (F5) o cerrar y reabrir la pestaña dentro de la
   ventana de validez del refresh token.

**Resultado esperado:** la sesión persiste — no vuelve a `/iniciar-sesion`.
Mientras rehidrata muestra brevemente "Cargando sesión…" en vez de parpadear
al login.

### 1.4 — Logout

**Pasos:**
1. Con sesión iniciada, abrir el menú de usuario del encabezado y cerrar
   sesión.

**Resultado esperado:** redirección a `/iniciar-sesion`. Intentar volver a
`/panel` con el botón "atrás" del navegador también redirige a login (sin
acceso a datos protegidos con la sesión ya cerrada).

### 1.5 — Control de acceso a rutas admin-only

**Precondición:** sesión iniciada como `asesor@crm.local` (o cualquier rol
no-administrador).

**Pasos:**
1. Navegar manualmente a `http://localhost:5173/usuarios`.
2. Navegar manualmente a `http://localhost:5173/bridges`.

**Resultado esperado:** ambas rutas rechazan el acceso (no se renderiza el
contenido de administrador). El menú lateral tampoco muestra esos enlaces
para este rol.

### 1.6 — Persistencia de sesión vs. expiración del refresh

**Precondición:** cualquier sesión iniciada.

**Pasos:**
1. Iniciar sesión.
2. Cerrar la pestaña del navegador y volver a abrir `http://localhost:5173`.

**Resultado esperado:** la sesión sigue activa (el `refreshToken` persiste en
`localStorage`; `accessToken` no, pero se renueva solo). Si el refresh
guardado ya no es válido (revocado, expirado), la sesión se cierra sola y
redirige a login — no queda una pantalla rota.

---

## 2. Configuración de bridges

Solo accesible como `admin@crm.local`. Guía completa de configuración de cada
bridge: [`13-configuracion-bridges.md`](13-configuracion-bridges.md).

### 2.1 — Activar el bridge Google Forms sembrado

**Precondición:** sesión como `admin@crm.local`.

**Pasos:**
1. Ir a `/bridges`.
2. Ubicar la fila **"Google Forms (pruebas)"** — Estado: **Inactivo**.
3. Hacer clic en **Reactivar**.

**Resultado esperado:** el badge de estado pasa a **Activo** sin recargar la
página completa. Backend: `PATCH /bridges/:id` con `{"estado": "ACTIVO"}`.

### 2.2 — Ver detalle y bitácora de ingesta

**Precondición:** caso 2.1 completado.

**Pasos:**
1. Hacer clic en el nombre **"Google Forms (pruebas)"** de la tabla.
2. Revisar la sección **Credenciales**: debe mostrar únicamente el botón
   **Regenerar clave** (estilo `CLAVE_API`) — nunca un campo de texto con la
   clave.
3. Revisar **Cuentas publicitarias asociadas**: debe mostrar el estado vacío
   "Este bridge todavía no tiene ninguna cuenta vinculada" (Google Forms no
   usa `CuentaPublicitaria`).
4. Revisar la sección **Bitácora de errores** al pie: vacía si todavía no se
   envió ningún lead con este bridge en esta sesión de pruebas.

**Resultado esperado:** las tres secciones cargan sin error; ninguna expone
la clave de API en texto plano.

### 2.3 — Crear cuenta publicitaria (no aplica a Google Forms)

El bridge Google Forms no admite alta de cuentas publicitarias desde la
interfaz (gap de diseño documentado, no un defecto: falta decidir de dónde
sale el `idExterno`). Para ejercitar este flujo con un bridge de estilo
`TOKEN_PROVEEDOR` (Facebook/Instagram), ver §4 de
`13-configuracion-bridges.md` — requiere crear un bridge `FACEBOOK` nuevo
primero (§2.4).

### 2.4 — Crear un bridge nuevo

**Pasos:**
1. En `/bridges`, hacer clic en **Nuevo bridge**.
2. Elegir cualquier red social del selector (poblado desde
   `GET /bridges/catalogo/redes-soportadas`) y un nombre, ej. "Facebook —
   Prueba QA".
3. Confirmar con **Crear bridge**.

**Resultado esperado:** aparece el modal de clave de un solo uso. El botón
"Entendido, cerrar" permanece deshabilitado hasta tildar la casilla de
confirmación. El bridge nuevo queda listado en estado **Inactivo**.

### 2.5 — Regenerar clave de API

**Precondición:** caso 2.1 completado (bridge Google Forms activo).

**Pasos:**
1. En `/bridges/:id` del bridge Google Forms → sección Credenciales → botón
   **Regenerar clave**.
2. Copiar la clave nueva del modal y confirmar.
3. Intentar un envío de ingesta (§3.1) con la clave **vieja**
   (`SEED_BRIDGE_CLAVE_API` original).

**Resultado esperado:** el envío con la clave vieja responde `401
bridge_no_autenticado` — quedó invalidada de inmediato. Repetir §3.1 con la
clave nueva funciona con normalidad.

---

## 3. Ingreso de leads

### 3.1 — Ingesta vía `POST /ingesta/generico`

**Precondición:** bridge Google Forms `ACTIVO` (caso 2.1). Reemplazar
`<CLAVE>` por el valor real de `SEED_BRIDGE_CLAVE_API` (§0).

**Pasos:**
1. Ejecutar:

   ```bash
   curl -i -X POST http://localhost:3000/api/v1/ingesta/generico \
     -H "X-Bridge-Key: <CLAVE>" \
     -H "Content-Type: application/json" \
     -d '{
       "idExternoLead": "qa-caso-3-1",
       "nombre": "Lead de Prueba QA",
       "telefono": "0987654321",
       "correo": "lead.qa@example.com",
       "idExternoCampania": "camp-qa",
       "nombreCampania": "Campaña QA",
       "camposDinamicos": { "origen_prueba": "manual-qa" }
     }'
   ```

**Resultado esperado:** `200 { "recepcionId": "<uuid>", "estado": "ACEPTADO" }`.

### 3.2 — Verificar aparición en `/leads`

**Precondición:** caso 3.1 completado. Puede tardar hasta unos segundos: el
recibo se confirma primero, la asignación automática corre después del
commit.

**Pasos:**
1. Como `admin@crm.local` (o `supervisor@crm.local`), ir a `/leads`.
2. Buscar "Lead de Prueba QA" en el campo de búsqueda.

**Resultado esperado:** el lead aparece en etapa **Nuevo**, red social
**Google Forms**, campaña "Campaña QA", con un responsable asignado
(asesor de menor carga activa en ese momento) y semáforo "Sin calificar".

### 3.3 — Deduplicación por teléfono

**Precondición:** caso 3.1 completado (mismo teléfono `0987654321`).

**Pasos:**
1. Reenviar el mismo `curl` de 3.1 pero con un `idExternoLead` **distinto**
   (ej. `"qa-caso-3-3"`) y el **mismo** `telefono`.

**Resultado esperado:** `200 ACEPTADO` igual (el recibo se acepta), pero no
se crea un segundo lead nuevo: como el cliente ya tiene un lead **abierto**
(etapa distinta de Venta/No Venta), el sistema registra un evento
"interacción repetida" sobre el lead existente y notifica al responsable
asignado — en `/leads` sigue habiendo un solo "Lead de Prueba QA" en Nuevo,
no dos.

### 3.4 — Idempotencia por `idExternoLead`

**Pasos:**
1. Reenviar exactamente el mismo `curl` de 3.1 (mismo `idExternoLead`
   `"qa-caso-3-1"`).

**Resultado esperado:** `200` con el **mismo** `recepcionId` que en 3.1. No
se crea ningún lead ni evento nuevo — reintento de webhook clásico.

---

## 4. Gestión y calificación de leads

Referencia de preguntas/pesos: [`04-formularios-semaforo.md`](04-formularios-semaforo.md).

### 4.1 — Completar formulario de calificación (etapa Nuevo → Contactado)

**Precondición:** sesión como `asesor@crm.local` (o el responsable real del
lead elegido — verificar la columna "Responsable" en `/leads` primero).
Usar uno de los leads reales en NUEVO del seed, ej. **Ana Vega**.

**Pasos:**
1. Ir a `/leads`, abrir el detalle de Ana Vega.
2. En el timeline, el nodo activo es **Nuevo** con su formulario expandido
   (5 preguntas: contacto logrado, reconoce el formulario, interés
   declarado, plazo de decisión, quién decide).
3. Responder las 5 preguntas eligiendo, por ejemplo, las opciones de mayor
   valor en cada una (para obtener un semáforo 🟢) — la previsualización de
   puntuación se actualiza en vivo junto al título del formulario.
4. Hacer clic en **Guardar y pasar a Contactado**.

**Resultado esperado:** el lead cambia a etapa **Contactado**, el semáforo se
recalcula según la fórmula ponderada (`Σ peso×valor / Σ peso×10 × 100`,
redondeado) y queda visible en el encabezado del lead y en `/leads`. El
timeline muestra "Nuevo" como completado y "Contactado" como nodo actual con
su propio formulario.

### 4.2 — Recalificación sin cambio de etapa

**Precondición:** un lead que ya tiene formulario respondido en su etapa
actual (ej. el lead de 4.1, todavía en Contactado).

**Pasos:**
1. Volver a completar el formulario de la etapa vigente con respuestas
   distintas.
2. Guardar.

**Resultado esperado:** la puntuación y el semáforo se recalculan, pero el
lead **no** cambia de etapa (`POST /leads/:id/formulario`, distinto del
`PATCH .../etapa` de 4.1).

### 4.3 — Elegir respuestas para obtener semáforo Rojo o Amarillo

**Precondición:** otro de los leads reales en NUEVO (ej. **Carlos Ruiz** o
**Maria Torres**).

**Pasos:**
1. Abrir su detalle, completar el formulario de Nuevo eligiendo
   deliberadamente las opciones de **menor** valor (ej. "No respondió, 1er
   intento", "Ninguno" de interés, "Sin plazo definido").
2. Guardar.

**Resultado esperado:** puntuación baja, semáforo 🔴 (0–39) o 🟡 (40–69)
según la combinación exacta. **Este lead queda como precondición del caso
5.3** (reasignación por el propio asesor, solo permitida en semáforo
rojo/amarillo) — no lo uses para otra prueba antes de llegar a esa sección.

---

## 5. Asignación, reasignación y traspaso

Reglas completas: [`02-reglas-negocio.md`](02-reglas-negocio.md) §3–§5.

### 5.1 — Asignación manual por administrador/supervisor

**Precondición:** sesión como `supervisor@crm.local`. Un lead sin asignar (si
no hay ninguno disponible, usar cualquiera y reasignarlo — este endpoint
también reemplaza al responsable actual).

**Pasos:**
1. En `/leads`, seleccionar un lead (checkbox de la fila — visible solo para
   administrador/supervisor).
2. En la barra de **Acciones masivas** que aparece, elegir un responsable del
   selector y hacer clic en **Asignar**.

**Resultado esperado:** el lead pasa a tener ese responsable. Se genera una
notificación `LEAD_ASIGNADO` para el nuevo responsable.

### 5.2 — Reasignación por administrador/supervisor (sin restricción)

**Precondición:** sesión como `admin@crm.local`. Un lead asignado a
`asesor@crm.local`.

**Pasos:**
1. Abrir el detalle de ese lead.
2. En **Responsable del lead**, usar el combobox de reasignación (busca solo
   entre asesores) y elegir `asesor2@crm.local`.
3. Confirmar con **Reasignar**.

**Resultado esperado:** el responsable cambia a `asesor2@crm.local`
independientemente del color de semáforo (admin/supervisor reasignan "sin
condición"). El reloj de SLA se reinicia. Notificación `LEAD_ASIGNADO` (o
equivalente) para `asesor2@crm.local`.

### 5.3 — Reasignación por el propio asesor (solo semáforo 🔴/🟡)

**Precondición:** caso 4.3 completado (lead con semáforo rojo o amarillo,
asignado a `asesor@crm.local` — verificar en el detalle antes de continuar;
si quedó asignado a otro asesor, iniciar sesión con ese usuario en su
lugar).

**Pasos:**
1. Iniciar sesión como el asesor responsable de ese lead.
2. Abrir su detalle. El botón **Reasignar** debe estar visible (guard de UX
   `canReassignLead`).
3. Elegir otro asesor en el combobox y confirmar.

**Resultado esperado:** la reasignación se acepta. El SLA se reinicia.

### 5.4 — Bloqueo de reasignación por el asesor cuando el semáforo es 🟢

**Precondición:** el lead de 4.1 (semáforo verde), todavía asignado al mismo
asesor.

**Pasos:**
1. Iniciar sesión como ese asesor.
2. Abrir el detalle del lead verde.

**Resultado esperado:** el botón/control de reasignación **no se muestra**
(guard de UX) — el backend igualmente lo rechazaría con `403
permiso_denegado` si se forzara la petición directamente. Confirmar además
que un `POST /leads/:id/reasignar` directo contra este lead con el token del
asesor devuelve `403`.

### 5.5 — Traspaso asesor → vendedor (automático)

**Precondición:** un lead en etapa **Contactado** o **Cita**, asignado a un
asesor (ej. el único lead en CONTACTADO del seed, o el lead de 4.1 tras
avanzarlo a Cita). Un lead en **Nuevo** no puede traspasarse — verificar que
el botón no aparece ahí.

**Pasos:**
1. Iniciar sesión como el asesor responsable.
2. Abrir el detalle → sección **Responsable del lead** → botón **Traspasar a
   vendedor** (el asesor no elige vendedor manualmente).
3. Confirmar.

**Resultado esperado:** `vendedor_id` queda fijado al vendedor de menor carga
activa (algoritmo de menor carga, mismo criterio que la asignación
automática). El asesor **conserva visibilidad** del lead pero pierde permiso
de edición. El SLA se reinicia a nombre del vendedor. Se genera notificación
`LEAD_TRASPASADO` para el vendedor receptor — comparar con el caso ya
sembrado de **Roberto Paredes**, cuya notificación `LEAD_TRASPASADO` es una
de las 18 del seed.

### 5.6 — Traspaso manual por administrador/supervisor (elige vendedor)

**Precondición:** sesión como `admin@crm.local`. Un lead en Contactado o
Cita.

**Pasos:**
1. Abrir el detalle del lead.
2. En **Responsable del lead**, elegir explícitamente `vendedor@crm.local`
   en el combobox (a diferencia de 5.5, admin/supervisor sí eligen
   manualmente) y confirmar **Traspasar**.

**Resultado esperado:** igual que 5.5, pero con el vendedor elegido a mano,
no el de menor carga.

### 5.7 — Vendedor no puede reasignar ni traspasar

**Precondición:** sesión como `vendedor@crm.local`, sobre un lead que tiene
asignado.

**Pasos:**
1. Abrir el detalle de un lead propio.

**Resultado esperado:** no aparece ningún control de reasignación ni
traspaso (Vendedor no tiene ese permiso en ningún caso, `docs/02` §9).

---

## 6. Citas

Reglas de estado y recordatorio: `docs/06-modulos-backend.md` M7.

### 6.1 — Verificar el estado de las citas ya sembradas (solo lectura)

**Precondición:** sesión como `admin@crm.local` o `supervisor@crm.local`.

**Pasos:**
1. Buscar en `/leads` y abrir, uno por uno: Roberto Paredes, Paola Zambrano,
   Camila Herrera, Miguel Chávez, Valeria Ortiz.
2. En cada detalle, revisar el panel **Citas**.

**Resultado esperado:**

| Lead | Estado esperado de la cita | Modalidad |
|---|---|---|
| Roberto Paredes | Agendada | Virtual |
| Paola Zambrano | Agendada | Presencial |
| Camila Herrera | Cumplida | — |
| Miguel Chávez | No asistió | — |
| Valeria Ortiz | Cancelada | — |

### 6.2 — Agendar una cita nueva

**Precondición:** sesión como el responsable de un lead en etapa **Cita**
(filtrar `/leads` por etapa Cita para encontrar uno de los 4 leads reales de
esa etapa).

**Pasos:**
1. Abrir el detalle del lead.
2. En el panel **Citas**, completar **Agendar cita**: fecha/hora futura,
   modalidad (Presencial/Virtual/Telefónica), notas opcionales.
3. Hacer clic en **Agendar**.

**Resultado esperado:** la cita aparece en la lista con estado **Agendada**.
Queda como precondición de los casos 6.3–6.5.

### 6.3 — Reprogramar (usando la cita ya sembrada de Paola Zambrano)

**Precondición:** cita de Paola Zambrano, actualmente **Agendada** (ya fue
reprogramada una vez antes — reprogramarla de nuevo es una acción válida,
no un no-op).

**Pasos:**
1. Abrir el detalle de Paola Zambrano.
2. En su cita, hacer clic en **Reprogramar**.
3. Elegir una nueva fecha/hora futura y confirmar.

**Resultado esperado:** la cita sigue en estado **Agendada** con la nueva
fecha (nunca queda en el estado `REPROGRAMADA` del enum — decisión de diseño
D-M7b, para que el recordatorio de 1h siga aplicando a la fecha nueva). Se
registra un evento `CITA_REPROGRAMADA` adicional en el lead.

### 6.4 — Intentar cancelar una cita ya cancelada (Valeria Ortiz)

**Precondición:** cita de Valeria Ortiz, ya en estado **Cancelada**.

**Pasos:**
1. Abrir su detalle. El panel de citas no debería ofrecer acciones sobre una
   cita ya en estado terminal (Cumplida/No asistió/Cancelada) — verificar
   que los botones de acción no aparecen para esa fila.
2. Si se dispara la petición directamente (`POST
   /citas/:citaId/cancelar` contra el `citaId` de Valeria), confirmar la
   respuesta.

**Resultado esperado:** el frontend no ofrece el botón (`puedeAccionar` es
`false` para estado `CANCELADA`). Por API: `409 cita_no_cancelable`,
"La cita ya está en estado CANCELADA y no puede cancelarse".

### 6.5 — Cancelar la cita creada en 6.2

**Precondición:** cita del caso 6.2, todavía Agendada.

**Pasos:**
1. En su fila, hacer clic en **Cancelar**.

**Resultado esperado:** pasa a estado **Cancelada**. El botón de acciones
desaparece para esa fila.

### 6.6 — Marcar resultado (Cumplida / No asistió) e impacto en el lead

**Precondición:** una cita Agendada — repetir el caso 6.2 para tener una
disponible (la de 6.5 ya quedó cancelada, no sirve para este caso).

**Pasos:**
1. Con la cita en estado Agendada, hacer clic en **Marcar cumplida** (o **No
   asistió** en otra cita de prueba).
2. Verificar el formulario de la etapa **Cita** del lead (pregunta "¿Asistió
   a la cita?").

**Resultado esperado:** el estado de la cita cambia, pero — a diferencia de
lo que podría esperarse — **no mueve automáticamente la etapa del lead ni
completa el formulario de Cita por sí solo** (decisión D-M7c: son registros
asociados, no la misma fuente de verdad). El vendedor sigue completando el
formulario de la etapa Cita por su flujo normal (§7). Comparar contra los
casos ya sembrados: la cita Cumplida de Camila Herrera corresponde a un lead
ya cerrado en Venta; la No asistió de Miguel Chávez, a un lead cerrado en No
Venta — ambos siguieron su cierre por el formulario/cierre de etapa, no por
el estado de la cita en sí.

---

## 7. Cierre de leads

### 7.1 — Cierre en Venta

**Precondición:** sesión como `vendedor@crm.local` (o el responsable real),
sobre un lead en cualquier etapa no terminal (Nuevo, Contactado o Cita —
el salto a cierre es directo desde cualquiera de ellas).

**Pasos:**
1. Abrir el detalle del lead.
2. Usar la barra de acción persistente **Cerrar como Venta**.
3. Completar: fecha de cierre, monto (ej. `750.00`), producto o servicio,
   forma de pago (Contado / Crédito / Financiamiento). Observaciones es
   opcional.
4. Confirmar en el diálogo "Confirmar cierre como Venta" ("Esta acción es
   irreversible…").

**Resultado esperado:** el lead pasa a etapa **Venta**, semáforo fijado en
🟢 sin cálculo. Comparar formato contra los dos ya sembrados: **Camila
Herrera** ($1250.50, crédito) y **Luis Castro** ($890, contado) —
visibles en `/leads` filtrando por etapa Venta.

### 7.2 — Cierre en No Venta

**Precondición:** otro lead en etapa no terminal.

**Pasos:**
1. Usar **Cerrar como No Venta**.
2. Completar fecha de cierre y la observación del motivo.
3. Intentar enviar con una observación de **menos de 20 caracteres** primero.

**Resultado esperado:** con menos de 20 caracteres, el formulario bloquea el
envío (contador "x/20 caracteres mínimos" bajo el campo). Con 20 o más,
tras confirmar el diálogo, el lead pasa a **No Venta**, semáforo 🔴 sin
cálculo. Comparar contra los ya sembrados: **Miguel Chávez** y **Diego
Suárez**.

### 7.3 — Bloqueo de edición tras el cierre

**Precondición:** cualquier lead ya cerrado (ej. Camila Herrera, Luis
Castro, Miguel Chávez o Diego Suárez, o el resultado de 7.1/7.2).

**Pasos:**
1. Abrir su detalle.

**Resultado esperado:** no hay timeline editable ni barra de cierre (etapas
terminales no se reabren, `docs/02` §6). Si el cliente vuelve a ingresar por
el embudo (ver caso 3.3, "interacción repetida"), la regla de reingreso
aplica sobre un lead **nuevo**, nunca reabriendo este.

---

## 8. Notificaciones y tiempo real

### 8.1 — Ver campana y contador de no leídas

**Precondición:** sesión como `asesor@crm.local` (tiene 14 notificaciones
`LEAD_ASIGNADO` del seed, probablemente todas sin leer si es la primera vez
que se usa esta cuenta en este ambiente).

**Pasos:**
1. Observar el ícono de campana en el encabezado.

**Resultado esperado:** insignia numérica con la cantidad de no leídas (o
"9+" si supera 9). El `aria-label` del botón describe el conteo en texto
("Notificaciones, N sin leer").

### 8.2 — Marcar una notificación como leída

**Pasos:**
1. Abrir el panel (clic en la campana).
2. Sobre una notificación no leída, hacer clic en el ícono de check.

**Resultado esperado:** el punto indicador de "no leída" desaparece en esa
fila y el contador de la campana baja en 1, sin recargar la página.

### 8.3 — Marcar todas como leídas

**Pasos:**
1. Con el panel abierto, hacer clic en **Marcar todas como leídas**.

**Resultado esperado:** el contador de la campana pasa a 0; el botón queda
deshabilitado (no hay más no leídas).

### 8.4 — Navegación al lead relacionado

**Pasos:**
1. Abrir el panel, hacer clic sobre una notificación que tenga lead asociado
   (la mayoría de las `LEAD_ASIGNADO` del seed lo tienen).

**Resultado esperado:** navega a `/leads/:id` del lead correspondiente y la
notificación queda marcada leída.

### 8.5 — Verificar SSE con dos pestañas

**Precondición:** dos pestañas del navegador con la **misma** sesión de
`asesor@crm.local` abiertas simultáneamente en cualquier ruta protegida.

**Pasos:**
1. Desde otra sesión (`admin@crm.local` en una ventana privada), asignar un
   lead a `asesor@crm.local` (caso 5.1, eligiéndolo como responsable).
2. Observar ambas pestañas del asesor sin recargar ninguna.

**Resultado esperado:** en ambas pestañas aparece el aviso emergente de
notificación nueva y el contador de la campana sube, sin recargar
manualmente — el canal SSE (`GET /eventos`, bearer-only, con reconexión por
`Last-Event-ID`) entrega el evento a cualquier conexión activa del mismo
usuario.

### 8.6 — Indicador de reconexión

**Pasos:**
1. Con sesión activa, cortar la conectividad del backend brevemente
   (`docker compose stop backend`) y luego restaurarla
   (`docker compose start backend`).

**Resultado esperado:** mientras el canal está interrumpido, aparece
"Reconectando notificaciones…" (o el estado terminal con botón
**Reintentar** si se agotan los reintentos acotados 1/2/4/8/16 s). Al
restablecerse el backend, el indicador desaparece y el canal vuelve a
recibir eventos.

---

## 9. Dashboard y métricas

Definición exacta de cada KPI: [`08-dashboard-kpis.md`](08-dashboard-kpis.md).

### 9.1 — KPIs de resumen contra los datos reales sembrados

**Precondición:** sesión como `admin@crm.local` o `supervisor@crm.local`
(alcance general). Rango de fechas amplio que cubra todo el seed (ej. "30
días" o personalizado).

**Pasos:**
1. Ir a `/panel`.
2. Revisar las tarjetas de resumen.

**Resultado esperado (sobre los 13 leads sembrados, antes de las ingestas
adicionales de la sección 3 y los cierres nuevos de la sección 7 — ejecutar
este caso **antes** de esas secciones si se quiere un número exacto y
reproducible):**

- **Total de leads ingresados:** 13.
- **Leads en gestión:** 9 (13 menos los 4 cerrados: 2 Venta + 2 No Venta).
- **Leads cerrados:** 4, desglosado 2 Venta / 2 No Venta.
- **Tasa de conversión:** 50 % (2 de 4 cerrados) — mostrada con el
  denominador junto al porcentaje ("50 % (2 de 4)").

Si se ejecuta después de las secciones 3/5/7, los totales suben en
consecuencia — usar esos números como referencia de fórmula, no como valor
fijo esperado en ese momento.

### 9.2 — Gráfica de leads por red social

**Pasos:**
1. Revisar la gráfica de barras "Leads por red social".

**Resultado esperado:** todos los 13 leads sembrados aparecen bajo **Google
Forms** (único bridge con leads reales en el seed) — barra única, sin otras
redes representadas todavía.

### 9.3 — Gráfica de leads por asesor (solo admin/supervisor)

**Precondición:** sesión como `admin@crm.local`.

**Pasos:**
1. Revisar "Leads por asesor".
2. Repetir el mismo panel con sesión de `asesor@crm.local`.

**Resultado esperado:** visible con desglose por responsable para
admin/supervisor. Para el asesor, esta gráfica específica no debe mostrarse
(`docs/08` §3.2: "visible solo para administrador y supervisor" — backend
responde `403 permiso_denegado` a `GET /metricas/por-asesor` si se llama
directamente con el token del asesor).

### 9.4 — Embudo por etapa

**Pasos:**
1. Revisar la gráfica de embudo.

**Resultado esperado:** orden Nuevo → Contactado → Cita → Venta, con el
porcentaje de caída entre etapas consecutivas. **No Venta se muestra
aparte**, nunca como paso del embudo.

### 9.5 — Distribución por semáforo

**Pasos:**
1. Revisar la gráfica de anillo "Distribución por semáforo".

**Resultado esperado:** solo cuenta leads en gestión (excluye los 4
cerrados, cuyo color es fijo). Los leads NUEVO recién ingresados sin
formulario respondido cuentan como "Sin calificar", no como ninguno de los
tres colores.

### 9.6 — Alcance por rol

**Pasos:**
1. Iniciar sesión como `asesor@crm.local`, ir a `/panel`.
2. Comparar contra la vista de `admin@crm.local`.

**Resultado esperado:** el asesor ve únicamente KPIs de su propia cartera
(leads donde es `asesorId`); admin/supervisor ven el total general.

### 9.7 — Comparativa contra el período anterior

**Pasos:**
1. Cambiar el selector de rango de fechas a "7 días" y observar el
   indicador de variación porcentual junto a cada KPI.

**Resultado esperado:** si el período anterior tuvo menos de 10 leads (caso
casi seguro en este ambiente de pruebas), se muestran **valores absolutos**
en vez de porcentaje — evita presentar ruido como señal sobre una base
chica.

### 9.8 — Actualización en tiempo real del dashboard

**Precondición:** `/panel` abierto en una pestaña.

**Pasos:**
1. Desde otra sesión, cerrar un lead (caso 7.1 o 7.2) o ingresar un lead
   nuevo (caso 3.1).
2. Observar el dashboard sin recargar manualmente.

**Resultado esperado:** los indicadores se refrescan solos en segundo plano
(señal `metricas.actualizadas` por SSE, agrupada en ventanas de 2 s —
puede haber una demora corta, no instantánea).

---

## 10. Administración de usuarios

Solo `admin@crm.local`.

### 10.1 — Listado con filtros y paginación

**Pasos:**
1. Ir a `/usuarios`.
2. Probar el filtro de búsqueda por nombre/correo, el filtro de rol y el de
   estado (activo/inactivo).

**Resultado esperado:** los 5 usuarios del seed aparecen listados (más
cualquiera creado durante las pruebas), con columnas Nombre, Correo, Rol,
Estado, Carga activa de leads (solo aplica a ASESOR/VENDEDOR; "No aplica"
para Administrador/Supervisor). Cambiar cualquier filtro reinicia la
paginación a la página 1.

### 10.2 — Alta de usuario

**Pasos:**
1. Botón **Nuevo usuario**.
2. Completar nombre, correo (único), rol, contraseña inicial (mínimo 12
   caracteres).
3. Confirmar **Crear usuario**.

**Resultado esperado:** el usuario aparece en el listado, `activo`. Repetir
con un correo ya usado (ej. `asesor@crm.local`) debe responder `409
correo_en_uso`.

### 10.3 — Edición de usuario

**Pasos:**
1. Sobre el usuario creado en 10.2, botón **Editar**.
2. Cambiar el nombre o el rol.
3. Confirmar.

**Resultado esperado:** los cambios se reflejan en el listado de inmediato.

### 10.4 — Restablecimiento de contraseña

**Pasos:**
1. Sobre cualquier usuario, botón **Restablecer contraseña**.
2. Ingresar una nueva contraseña (≥12 caracteres) y su confirmación.
3. Confirmar.

**Resultado esperado:** `200`, sin pedir la contraseña actual (a diferencia
del autoservicio, este flujo de administrador no la necesita). Verificar
iniciando sesión con ese usuario y la contraseña nueva.

### 10.5 — Baja lógica con reasignación automática de cartera

**Precondición:** usar `asesor2@crm.local` (tiene 3 leads asignados según
las notificaciones del seed) — **no** usar `asesor@crm.local` si es el único
asesor activo restante, porque dejaría sin candidato de reasignación (ver
10.6).

**Pasos:**
1. Sobre `asesor2@crm.local`, botón **Dar de baja**.
2. Leer el diálogo: "Si tiene cartera activa, el sistema la reasigna
   automáticamente al compañero del mismo rol con menor carga activa".
3. Confirmar **Confirmar baja**.

**Resultado esperado:** `asesor2@crm.local` pasa a **Inactivo**; ya no puede
iniciar sesión (probar con sus credenciales — debe fallar como 1.2, mismo
código `credenciales_invalidas`, sin distinguir "usuario inactivo" de
"contraseña incorrecta"). Sus leads activos se reasignan atómicamente a
`asesor@crm.local` (único otro asesor activo) en la misma transacción de
baja — verificar en `/leads` que los leads que eran de `asesor2` ahora
muestran a `asesor@crm.local` como responsable.

### 10.6 — Baja rechazada por falta de candidato

**Precondición:** un rol operativo (ASESOR o VENDEDOR) con un **único**
usuario activo y cartera abierta — por ejemplo, tras 10.5, intentar dar de
baja también a `asesor@crm.local` (ahora el único asesor activo, con
cartera).

**Pasos:**
1. Sobre `asesor@crm.local`, botón **Dar de baja** → **Confirmar baja**.

**Resultado esperado:** la baja se **rechaza entera**: `409
baja_sin_candidato_reasignacion`. Nada se persiste — ni la baja, ni ninguna
reasignación parcial. `asesor@crm.local` sigue activo con su cartera intacta.

---

## 11. Casos negativos y edge cases

### 11.1 — Payload inválido en ingesta

**Pasos:**
1. `POST /ingesta/generico` con la clave válida pero sin `idExternoLead`
   (campo obligatorio):

   ```bash
   curl -i -X POST http://localhost:3000/api/v1/ingesta/generico \
     -H "X-Bridge-Key: <CLAVE>" -H "Content-Type: application/json" \
     -d '{"nombre": "Sin id externo"}'
   ```

**Resultado esperado:** `400 validacion_invalida`. No se crea ningún lead ni
recibo.

### 11.2 — Clave de bridge ausente, inválida o de bridge inactivo

**Pasos:**
1. Repetir 3.1 sin el header `X-Bridge-Key`.
2. Repetir con una clave inventada.
3. Repetir con la clave de un bridge que esté `INACTIVO`.

**Resultado esperado:** los tres casos responden `401
bridge_no_autenticado` y registran una fila `bridge_logs` nivel `ERROR`
(visible en `/bridges/:id` → Bitácora, si el bridge existe).

### 11.3 — Rol sin permiso

**Pasos:**
1. Con el token de `asesor@crm.local`, llamar directamente
   `GET /api/v1/usuarios` (ruta admin-only):

   ```bash
   curl -i http://localhost:3000/api/v1/usuarios \
     -H "Authorization: Bearer <ACCESS_TOKEN_ASESOR>"
   ```

**Resultado esperado:** `403 permiso_denegado`.

### 11.4 — Teléfono mal formado en un lead entrante

**Pasos:**
1. `POST /ingesta/generico` con un `telefono` no normalizable (ej.
   `"telefono": "abc"`).

**Resultado esperado:** `200 ACEPTADO` igual — el lead **se persiste**, con
`telefono_valido = false`, marcado en la bitácora del bridge. Nunca se
descarta por este motivo (dato comercial pagado).

### 11.5 — Cierre duplicado / transición inválida

**Precondición:** un lead ya cerrado (Venta o No Venta).

**Pasos:**
1. Intentar `PATCH /leads/:id/etapa` contra ese lead con
   `{"etapa": "VENTA", ...}` nuevamente.
2. Intentar retroceder un lead en Cita a `{"etapa": "NUEVO"}`.

**Resultado esperado:** ambos casos responden `409 transicion_invalida` — el
progreso es lineal hacia adelante entre etapas no terminales, y una etapa
terminal no se reabre.

### 11.6 — Venta sin monto

**Pasos:**
1. `PATCH /leads/:id/etapa` con `{"etapa": "VENTA", "productoServicio": "x",
   "formaPago": "CONTADO"}` (sin `montoVenta`).

**Resultado esperado:** `400 validacion_invalida` (Zod: `montoVenta` es
obligatorio y positivo para VENTA).

### 11.7 — No Venta con observación corta

Cubierto también en 7.2 desde la interfaz. Por API:

```bash
curl -i -X PATCH http://localhost:3000/api/v1/leads/<LEAD_ID>/etapa \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"etapa": "NO_VENTA", "observacionCierre": "corta"}'
```

**Resultado esperado:** `400 validacion_invalida` (mínimo 20 caracteres).

### 11.8 — Acceso a un lead ajeno

**Precondición:** `asesor2@crm.local` intentando acceder a un lead asignado
solo a `asesor@crm.local` (o viceversa).

**Pasos:**
1. `GET /leads/:id` con el token del asesor que no es responsable.

**Resultado esperado:** `403 permiso_denegado`, "No tienes acceso a este
lead" — un asesor no ve leads ajenos (Vendedor tampoco ve los del resto de
vendedores).

### 11.9 — Token de acceso ausente o expirado

**Pasos:**
1. Llamar cualquier endpoint protegido sin header `Authorization`.
2. Llamar con un JWT manipulado/inválido.

**Resultado esperado:** ambos casos `401 no_autenticado`.

### 11.10 — Firma de Meta ausente o inválida

Ver también §4.3 de `13-configuracion-bridges.md`.

**Pasos:**
1. `POST /ingesta/meta` sin el header `X-Hub-Signature-256`.

**Resultado esperado:** `401 firma_meta_invalida`, registro `bridge_logs`
ERROR, y el payload **nunca se encola** (a diferencia de una firma válida
con forma de payload inesperada, que sí responde `200` para no generar
reintentos infinitos del lado de Meta).

---

## 12. Pruebas dependientes del tiempo

Estas pruebas **no son ejecutables de inmediato** — requieren dejar el stack
corriendo un intervalo real o preparar datos con fechas específicas. No las
marques como fallidas si no se ejecutan en la misma sesión que el resto del
checklist.

### 12.1 — SLA: cambio a "En riesgo" a las 18 horas

**Requiere:** dejar el stack corriendo (o un lead asignado) durante al menos
18 horas sin cambiar su etapa, con el plazo por defecto de 24 h
(`SLA_HORAS`). El estado se calcula al vuelo en cada consulta (nunca
persistido), así que no hace falta ningún job para verlo cambiar — alcanza
con que pase el tiempo real.

**Pasos (tras esperar):**
1. Abrir el lead que lleva ≥18 h sin cambio de etapa desde su asignación.

**Resultado esperado:** el estado de SLA mostrado pasa de "A tiempo" a
"En riesgo (HH:MM:SS)" exactamente a partir de las 18 h transcurridas (25 %
o menos del plazo restante).

### 12.2 — SLA: alerta de atraso pasadas 24 horas

**Requiere:** el mismo lead, ahora ≥24 h sin cambio de etapa. El trabajo
programado (`sla-atrasado.job.ts`) corre cada 15 minutos — la notificación
puede demorar hasta ese margen tras cruzar las 24 h exactas.

**Resultado esperado:** notificación `LEAD_SIN_ATENDER` al responsable y a
los supervisores; el estado de SLA mostrado pasa a "Atrasado (-HH:MM:SS)".
Sin reasignación automática — solo notifica, un supervisor decide.

### 12.3 — Recordatorio de cita 1 hora antes

**Requiere:** crear una cita nueva (caso 6.2) con `programadaPara` fijada a
menos de 1 hora en el futuro respecto del momento de creación (ej. 20-30
minutos adelante), y dejar el stack corriendo hasta pasar ese horario. El
trabajo (`citas-recordatorio.job.ts`) corre cada 15 minutos y marca las citas
`AGENDADA` cuya `programadaPara` cae en la ventana `[ahora, ahora + 1h]`.

**Pasos:**
1. Agendar la cita con la fecha próxima descrita arriba.
2. Esperar hasta que falte menos de 1 hora para la cita (y hasta 15 minutos
   adicionales para el próximo tick del job).

**Resultado esperado:** notificación `RECORDATORIO_CITA` para el
responsable del lead, entregada también por SSE si tiene una sesión activa.
No se duplica en ticks posteriores (marca `recordatorio_enviado`).

### 12.4 — Verificación diaria de token de Meta

**Requiere:** un bridge Meta con al menos una cuenta publicitaria con token
cargado (ver `13-configuracion-bridges.md` §4), y dejar el stack corriendo
hasta el siguiente ciclo de 24 h del job
(`verificacion-token.job.ts`) — o revocar el token manualmente desde Meta
Business y esperar el ciclo.

**Resultado esperado:** si el token dejó de ser válido, la cuenta pasa a
`estadoToken: TOKEN_EXPIRADO`, se registra `bridge_logs` nivel `ERROR` y se
notifica a los administradores.

### 12.5 — Bridge sin actividad por 72 horas

**Requiere:** un bridge `ACTIVO` con al menos un lead recibido alguna vez
(`ultimoLeadEn` no nulo) y sin recibir ningún lead nuevo durante 72 horas
corridas.

**Resultado esperado:** se registra una entrada `bridge_logs` nivel
`ADVERTENCIA` ("bridge sin actividad"), visible en la Bitácora del bridge —
sin notificación push a administradores (ese nivel no la dispara hoy, solo
`ERROR` lo hace). No se repite en cada tick de 15 minutos mientras el
silencio continúa (anti-spam por `advertenciaMudoEnviada`).
