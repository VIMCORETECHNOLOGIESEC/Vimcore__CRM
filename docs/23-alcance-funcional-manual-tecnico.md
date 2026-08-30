# Alcance funcional para el manual técnico/de usuario

> **Material de coordinación**, no un contrato de backend ni un documento
> AS-IS/TO-BE en el sentido de `docs/00-estado-documentacion.md`. Su
> propósito es servir de insumo directo para que una persona sin
> conocimiento del código pueda redactar el manual técnico/de usuario de la
> aplicación: qué hace cada pantalla, cómo se usa, y qué falta todavía.
>
> **Cómo usar este documento**: cada pantalla/módulo tiene un estado
> (✅/🚧/⏳/🎨). Las marcadas ✅ ya se pueden documentar y capturar en
> pantalla hoy mismo. Las demás quedan con la descripción funcional
> esperada, para no bloquear la redacción del resto del manual — se
> completan (capturas + ajustes de texto si el diseño final cambia) a
> medida que se implementan. No hace falta esperar a que el 100% del
> proyecto esté cerrado para empezar a escribir el manual.

## Tabla resumen

| # | Pantalla / módulo | Estado | Área |
|---|---|---|---|
| 1 | Inicio de sesión | ✅ | Autenticación y roles |
| 2 | Perfil de usuario | ✅ | Autenticación y roles |
| 3 | Listado de leads | ✅ | Leads |
| 4 | Detalle de lead (datos, timeline, cierre, citas) | ✅ | Leads |
| 5 | Chat de WhatsApp en detalle de lead | 🎨 | Leads |
| 6 | Listado de bridges (integraciones) | ✅ | Bridges / Integraciones |
| 7 | Alta de bridge | ✅ | Bridges / Integraciones |
| 8 | Detalle de bridge (credenciales, cuentas publicitarias, bitácora) | ✅ | Bridges / Integraciones |
| 9 | Bridge API_EXTERNA (bridgeApi) | ✅ | Bridges / Integraciones |
| 10 | Integración LinkedIn | ✅ | Bridges / Integraciones |
| 11 | Integración WhatsApp Business (real) | 🚧 | Bridges / Integraciones |
| 12 | Dashboard de métricas (general) | ✅ | Dashboard y Métricas |
| 13 | Extensiones de dashboard (embudo de Oportunidad, rendimiento por producto) | ✅ | Dashboard y Métricas |
| 14 | Dashboard con filtro por empresa (holding) | ✅ | Dashboard y Métricas |
| 15 | Exportación de reportes (PDF/XLSX) | ✅ | Reportes |
| 16 | Conexión de Meta Ads (métricas publicitarias reales) | ⏳ | Reportes |
| 17 | Listado y detalle de Oportunidad (negociación) | ✅ | Negociación / Oportunidad |
| 18 | Listado de usuarios | ✅ | Usuarios y Membresías |
| 19 | Alta de usuario | 🚧 | Usuarios y Membresías |
| 20 | Edición de usuario | ✅ | Usuarios y Membresías |
| 21 | Baja de usuario (con reasignación de cartera) | ✅ | Usuarios y Membresías |
| 22 | Restablecimiento de contraseña | ✅ | Usuarios y Membresías |
| 23 | Alta de administrador de empresa | ✅ | Usuarios y Membresías |
| 24 | Membresía por red social (asesor scopeado por canal) | ⏳ | Usuarios y Membresías |
| 25 | Tab usuarios holding-wide vs. usuarios por empresa | ✅ | Usuarios y Membresías |
| 26 | Gestor de empresas (listado) | ✅ | Gestión de Empresas / Holding |
| 27 | Gestor de empresas (cards con isotipo) | ✅ | Gestión de Empresas / Holding |
| 28 | Detalle de empresa (usuarios y bridges de esa empresa) | 🚧 | Gestión de Empresas / Holding |
| 29 | Acceder a empresa / salir de vista de empresa | ✅ | Gestión de Empresas / Holding |
| 30 | Alta de empresa nueva | ⏳ | Gestión de Empresas / Holding |
| 31 | Configuración de empresa (single-company legacy) | ✅ | Configuración / Apariencia |
| 32 | Apariencia de la propia empresa (self-service) | ✅ | Configuración / Apariencia |

---

## Autenticación y roles

### Inicio de sesión

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Pantalla pública de acceso a la aplicación. Autentica por correo y contraseña, contra dos posibles orígenes de credenciales: la cuenta de usuario "clásica" (`Usuario`) o una credencial propia de una `Membresia` (empresa específica) — el sistema decide sola cuál corresponde, la persona solo escribe correo y contraseña.

**Pasos de uso**:
1. Ingresar a la URL de la aplicación (redirige automáticamente a `/iniciar-sesion` si no hay sesión activa).
2. Completar correo y contraseña.
3. Confirmar. Si las credenciales son válidas, la aplicación redirige al panel principal (`/panel`).

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: la sesión resultante queda marcada internamente como `holding` (acceso a todo el grupo de empresas) o `company` (acotada a una sola empresa), según la credencial usada. Esto determina qué pantallas y datos ve la persona más adelante.

### Perfil de usuario

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Muestra los datos del usuario autenticado (nombre, correo, rol) y permite cerrar sesión.

**Pasos de uso**:
1. Ingresar desde el menú lateral, opción "Perfil".
2. Revisar los datos propios.
3. Usar el botón de cerrar sesión para terminar la sesión activa.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

---

## Leads

### Listado de leads

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Pantalla de trabajo diario del equipo comercial. Lista todos los leads visibles para la persona (según su rol y su cartera asignada), con filtros y acciones masivas de asignación.

**Pasos de uso**:
1. Ingresar desde el menú lateral, opción "Leads".
2. Usar los filtros disponibles (etapa, red social, campaña, responsable, rango de fechas) para acotar el listado.
3. Navegar entre páginas de resultados con los controles de paginación (primera, anterior, siguiente, última página).
4. Administradores y supervisores pueden seleccionar varios leads y usar "Acciones masivas" para asignarlos en lote a un responsable.
5. Hacer clic en un lead de la tabla para ir a su detalle.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: un asesor o vendedor solo ve su propia cartera; administrador y supervisor ven el listado completo. Sin selector de cantidad de leads por página todavía (fijo en 10).

### Detalle de lead

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Vista de trabajo de un lead individual — datos de contacto, origen, línea de tiempo de la negociación, gestión de citas y cierre (venta o no venta).

**Pasos de uso**:
1. Desde el listado de leads, hacer clic en un lead.
2. Revisar datos de contacto y origen (red social, campaña).
3. Avanzar la etapa del lead siguiendo el flujo lineal: Nuevo → Contactado → Cita agendada, o saltar directo a cierre (Venta / No venta) desde cualquier etapa no terminal.
4. Si corresponde, coordinar una cita desde el panel de citas.
5. Al cerrar el lead como Venta, completar el formulario de cierre de venta (monto, forma de pago). Al cerrar como No venta, completar el formulario correspondiente con el motivo.
6. Una vez cerrado (Venta o No venta), el lead queda en un estado terminal y no puede volver a moverse.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: las transiciones de etapa son estrictamente hacia adelante — nunca se puede retroceder una etapa ya superada.

### Chat de WhatsApp en detalle de lead

**Estado**: 🎨 UI lista, sin conexión real

**Descripción funcional**: Panel de chat estilo WhatsApp dentro del detalle de un lead, pensado para conversar con el cliente sin salir de la aplicación.

**Pasos de uso esperados** (una vez conectado):
1. Desde el detalle de un lead, abrir el ícono de WhatsApp.
2. Ver el historial de mensajes con ese contacto.
3. Escribir y enviar un mensaje nuevo directamente desde la aplicación.

**Captura de pantalla**: _[CAPTURA PENDIENTE — pantalla visible hoy, pero con datos de ejemplo, no reales]_

**Notas técnicas**: la interfaz visual ya está construida (incluida la animación de apertura/cierre), pero hoy muestra una conversación de ejemplo fija — no envía ni recibe mensajes reales todavía. Falta conectarla al módulo de mensajería de WhatsApp del backend (ver "Integración WhatsApp Business" más abajo), que sí está listo del lado del servidor.

---

## Bridges / Integraciones

### Listado de bridges

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Administra las conexiones ("bridges") con cada canal de captación de leads (redes sociales y otras fuentes).

**Pasos de uso**:
1. Ingresar desde el menú lateral, opción "Bridges" (solo visible para Administrador).
2. Revisar el listado con paginación.
3. Hacer clic en un bridge para ver su detalle.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Alta de bridge

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Crea una conexión nueva con un canal de captación.

**Pasos de uso**:
1. Desde el listado de bridges, usar el botón de alta.
2. Elegir la red social/canal.
3. Completar los datos requeridos según el canal elegido.
4. Confirmar la creación.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Detalle de bridge

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Vista de administración de un bridge puntual — resumen, credenciales, cuentas publicitarias asociadas y bitácora de errores.

**Pasos de uso**:
1. Desde el listado, hacer clic en un bridge.
2. Revisar el resumen general.
3. Cargar o actualizar credenciales del bridge.
4. Administrar las cuentas publicitarias asociadas (alta, edición, prueba de conexión).
5. Revisar la bitácora de errores para diagnosticar problemas de conexión.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Bridge API_EXTERNA (bridgeApi)

**Estado**: ✅ Implementado y funcional (con límite de alcance conocido)

**Descripción funcional**: Permite conectar un bridge genérico contra una API externa no cubierta por los canales predefinidos.

**Pasos de uso**:
1. Al dar de alta un bridge, elegir la opción "API externa" en vez de una red social predefinida.
2. Completar la configuración de conexión (URL, credencial, header de API key).
3. Completar el mapeo de campos.
4. Probar la conexión antes de guardar.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: `ApiExternaSetupDialog.tsx` está conectado a los 3 endpoints reales de configuración/prueba (`PATCH /bridges/:id/api-externa/conexion`, `PATCH /bridges/:id/api-externa/mapeo`, `POST /bridges/:id/api-externa/probar-conexion`; el alta del bridge en sí sigue siendo el `POST /bridges` genérico) — sin datos mock, commit `3fa8ea1` en `origin/test/gpt`. **Límite de alcance conocido y aceptado** (documentado en `docs/contrato-frontend-bridge-api_mat_01.md`): el job de backend que hace polling y efectivamente trae los leads todavía no existe, así que un bridge API_EXTERNA configurado hoy no recibe leads reales todavía en este entorno — no es un bug de esta pantalla, es un gap de backend ya conocido.

### Integración LinkedIn

**Estado**: ✅ Implementado y funcional (con reserva de backend, ver nota)

**Descripción funcional**: Conexión de una cuenta de LinkedIn Ads para sincronizar leads de formularios de LinkedIn.

**Pasos de uso**:
1. Conectar la cuenta de LinkedIn mediante autenticación OAuth.
2. Descubrir y elegir los formularios de captación a sincronizar.
3. Activar la suscripción para recibir leads nuevos.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: `frontend/src/funcionalidades/linkedin/` está conectado a los 7 endpoints reales del contrato (`docs/contrato-frontend-linkedin-api_mat_05.md`: iniciar OAuth, callback, ver conexión, probar conexión, listar fuentes, descubrir fuentes, activar/desactivar fuente) — sin mocks, commit `ac906c9` en `origin/test/gpt`. **Reserva de backend pendiente de confirmar por Mateo**: según `docs/claude-linkedin-estado-actual.md` (pusheado, mismo estado que `origin/test/gpt`), a la fecha de esta revisión el webhook que efectivamente recibe los leads de LinkedIn ("webhook durable V3") todavía no estaba implementado — solo OAuth, conexión, discovery de fuentes y activación/suscripción a `leadNotifications` lo estaban. Si ese webhook sigue pendiente, activar una fuente desde esta pantalla no hace llegar leads reales al CRM todavía, igual que el límite ya documentado en "Bridge API_EXTERNA" — Mateo debe confirmar el estado actual de esa pieza antes de dar por cerrado el flujo de punta a punta.

### Integración WhatsApp Business (real)

**Estado**: 🚧 En curso — Parte 1 (conexión) hecha y pusheada; Parte 2 (mensajería real) construida pero congelada, pendiente de decisión de alcance

**Descripción funcional**: Conexión de una cuenta de WhatsApp Business y, en una segunda etapa, envío/recepción de mensajes reales desde la aplicación (ver también "Chat de WhatsApp en detalle de lead").

**Parte 1 — Conexión (Embedded Signup): ✅ hecha y pusheada**

**Pasos de uso**:
1. Conectar el número de WhatsApp Business mediante autenticación asistida (Embedded Signup de Meta).
2. Elegir el número a conectar.
3. La conexión queda persistida.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: `funcionalidades/whatsapp/` (`ConectarWhatsAppCard.tsx`, montada en `BridgesPage.tsx`; `WhatsAppCallbackPage.tsx`, ruta pública `/whatsapp/callback`; `useWhatsApp.ts`; `whatsapp.api.ts`; `whatsapp.utils.ts`; `tipos/whatsapp.ts`) está conectado a los endpoints reales del contrato (`docs/contrato-frontend-whatsapp-api_mat_04.md` secciones 1-3: `GET /whatsapp/conectar`, `GET /whatsapp/callback`, `POST /whatsapp/conexion`) — sin mocks, commit `e684eee` en `origin/test/gpt`. Esta excepción de alcance está aprobada y documentada explícitamente en `AGENTS.md` §7.

**Parte 2 — Bandeja de conversaciones (envío/recepción real de mensajes): pendiente de coordinación, NO lista**

**Estado**: construida y en verde en este worktree, pero **congelada sin commitear** por decisión del usuario, a la espera de coordinar con el desarrollador de backend (Mateo) si entra en esta ronda de despliegue. `AGENTS.md` §7 es explícito: la excepción de alcance aprobada cubre únicamente el flujo de **conexión** (Parte 1); el envío y recepción real de mensajes **no** está cubierto por esa ampliación y sigue fuera de alcance salvo que se decida aparte — probablemente como su propio bloque SDD.

**Notas técnicas**: no confundir con "Chat de WhatsApp en detalle de lead" (ítem 5), que sigue siendo la UI de demo con datos mock — la bandeja real (`CajaRespuesta.tsx`, `ConversacionesPage.tsx`, `HiloMensajes.tsx`, `ListaConversaciones.tsx`, `conversaciones.api.ts`, `conversaciones.utils.ts`, `useConversaciones.ts`, `tipos/conversacion.ts`) existe como archivos sin commitear en el worktree de desarrollo al momento de esta revisión — no está en `origin/test/gpt` y no debe documentarse como disponible hasta que se resuelva el alcance y se commitee/pushee.

---

## Dashboard y Métricas

### Dashboard de métricas (general)

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Panel principal de indicadores comerciales — volumen de leads, conversión, tiempos de respuesta y cierre, cumplimiento de SLA, y gráficos de distribución por etapa, red social, asesor y campaña.

**Pasos de uso**:
1. Ingresar desde el menú lateral, opción "Dashboard" (pantalla de inicio por defecto).
2. Elegir el rango de fechas a analizar.
3. Aplicar filtros adicionales (red social, campaña, responsable) según el rol.
4. Revisar los indicadores principales: total de leads ingresados, leads en gestión, leads cerrados, tasa de conversión.
5. Revisar los indicadores secundarios: tiempo promedio de primera respuesta, tiempo promedio de cierre, cumplimiento de SLA.
6. Revisar los gráficos de embudo, distribución por semáforo, por asesor, por campaña y por red social.
7. Exportar el dashboard si hace falta compartirlo.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: administrador y supervisor ven el "Dashboard general" (todo el alcance visible para su sesión); asesor y vendedor ven una vista acotada a su propia cartera.

### Extensiones de dashboard (embudo de Oportunidad, rendimiento por producto)

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Ampliación del "Dashboard general" con métricas de negociación sobre `Oportunidad`: embudo de Oportunidad, ranking global por producto, cascada Lead→Oportunidad (stat compacto) y ranking de productos por empresa. Para una sesión holding-wide, el ranking por empresa muestra un aviso visible en vez de ocultarse (gap de backend conocido, ver nota).

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: commits `e1f2dca` (frontend) sobre backend ya cerrado en `dev-mateo` (`docs/blocks/e-dashboards.md`), pusheados a `origin/test/gpt`. Componentes: `GraficoEmbudoOportunidad.tsx`, `GraficoPorProducto.tsx`, `CascadaLeadOportunidad.tsx`, `GraficoRankingProductosPorEmpresa.tsx`, con 14 tests propios (892/892 en la suite completa al momento de esta verificación). Excepción de alcance documentada en `AGENTS.md` §7 (2026-08-30, por indicación directa del usuario). **Gap de backend conocido (E5)**: `getRankingProductosPorEmpresa` no desglosa correctamente por empresa para una sesión holding-wide (test en rojo en backend, ver `docs/blocks/e-dashboards.md`) — el frontend ya lo contempla con un aviso visible en la sección en vez de mostrar datos incompletos silenciosamente. La exportación a PDF/XLSX de estas métricas no está conectada todavía (deliberado, fuera de este ítem).

### Dashboard con filtro por empresa (holding)

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Para una sesión de holding (`ADMINISTRADOR`), un selector de empresa (combobox buscable) en el dashboard permite hacer drill-down a una empresa puntual; sin selección, se ve el agregado de todo el holding (comportamiento previo sin cambios).

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: commit `33968fe` (frontend, `SelectorEmpresaDashboard.tsx`, `empresaId` threadeado a las 13 queries de `useMetricas.ts`, gateado a `ADMINISTRADOR` + sesión holding). El schema `empresaId` opcional (`resolveEmpresaId`, 3 ramas: company-scoped lo ignora, holding-wide con `empresaId` hace drill-down, sin él ve todo el holding) llegó a `test/gpt` con el merge `main→test/gpt` (`f6ce0be`, 2026-08-30) — verificado presente en `backend/src/schemas/metricas.schema.ts`. El filtro ya es real de punta a punta. Excepción de alcance documentada en `AGENTS.md` §7 (2026-08-30, mismo bloque que el ítem 13).

---

## Reportes

### Exportación de reportes (PDF/XLSX)

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Generación asíncrona de reportes comerciales en PDF o XLSX, gateada a `ADMINISTRADOR`/`SUPERVISOR`, con estado visible (`PENDIENTE`/`PROCESANDO`/`LISTO`/`ERROR`) refrescado por SSE y descarga autenticada una vez listo.

**Pasos de uso**:
1. Ingresar a "Reportes" desde el menú lateral (visible solo para administrador/supervisor).
2. Elegir el tipo de reporte y los parámetros.
3. Solicitar la generación — el job pasa por su estado en tiempo real vía notificaciones SSE, sin polling.
4. Descargar el archivo una vez que el estado pasa a "Listo".

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: commit `c8f80a5` (local, verificado, pendiente de push a `origin/test/gpt`). Frontend: `funcionalidades/reportes/` (`reportes.api.ts`, `useReportes.ts`, `ReportesPage.tsx`, `EstadoReporteJobBadge.tsx`, `DescargarReporteButton.tsx`) + `tipos/reporte.ts`, contra `POST /reportes/jobs`, `GET /reportes/jobs/activo`, `GET /reportes/jobs/:id`, `GET /reportes/jobs/:id/descargar`. Ruta `reportes` gateada por rol en `router.tsx`. Extensión aditiva de `notificaciones.sse.ts`/`useNotificacionesRealtime.ts` para `reporte.iniciado`/`listo`/`error` (mismo mecanismo que WhatsApp). Excepción de alcance documentada en `AGENTS.md` §7 (2026-08-30, por indicación directa del usuario).

### Conexión de Meta Ads (métricas publicitarias reales)

**Estado**: ⏳ Pendiente (sin frontend, backend listo)

**Descripción funcional esperada**: Conexión de una cuenta de anuncios de Meta (Facebook/Instagram) para sincronizar métricas publicitarias reales (costo por lead, costo por clic, costo de adquisición) y cruzarlas con la conversión real del CRM.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: sin contrato de frontend formalizado todavía.

---

## Negociación / Oportunidad

### Listado y detalle de Oportunidad

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Nueva entidad de negociación, separada del Lead de captación — permite que un mismo cliente tenga varias negociaciones paralelas (una por producto). Listado filtrable y paginado (`OportunidadesPage.tsx`), alta de oportunidad desde un lead (`NuevaOportunidadButton.tsx` en `LeadDetallePage.tsx`), detalle con avance de etapa (`NUEVO→CONTACTADO→CITA`, sin saltos directos a `VENTA`/`NO_VENTA`), cierre de VENTA/NO_VENTA con autoridad restringida al asesor habilitado (403 inline si no tiene `habilitadoParaVenta`, sin bypass de admin/supervisor salvo excepción de reasignación), reasignación admin/supervisor, y catálogo de productos gated a `ADMINISTRADOR`.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: commit `0a0ab91`, pusheado a `origin/test/gpt`. Rutas `oportunidades`/`oportunidades/:id` en `router.tsx`, ítem de menú "Oportunidades" en `layouts/navigation.ts`. 17 archivos de test / 110 tests propios (892/892 en la suite completa al momento de esta verificación). Las reglas de negocio D7 (autoridad de cierre) y D9 (reasignación) ya estaban implementadas en backend — el frontend solo las consume. Excepción de alcance documentada en `AGENTS.md` §7 (2026-08-30, por indicación directa del usuario) — no incluye dashboards jerárquicos (ver ítem anterior) ni el "corte" de columnas de negociación en `Lead`, que sigue como fase separada sin arrancar.

---

## Usuarios y Membresías

### Listado de usuarios

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Administra las cuentas de usuario del sistema (solo accesible para Administrador).

**Pasos de uso**:
1. Ingresar desde el menú lateral, opción "Usuarios".
2. Filtrar por rol o estado (activo/inactivo).
3. Navegar entre páginas de resultados.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Alta de usuario

**Estado**: 🚧 En desarrollo

**Descripción funcional**: Crea una cuenta de usuario nueva, con nombre, correo, contraseña y rol.

**Pasos de uso**:
1. Desde el listado de usuarios, usar el botón de alta.
2. Completar nombre, correo, contraseña y rol.
3. Confirmar la creación.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: el selector de rol está siendo modificado — el rol "Vendedor" se está retirando como opción separada, ya que pasa a ser un permiso ("habilitado para venta") dentro del rol Asesor, en línea con una decisión de producto ya cerrada. Este cambio puede dejar temporalmente sin efecto la creación de usuarios con el rol legacy "Vendedor" hasta que el backend complete la migración correspondiente.

### Edición de usuario

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Modifica los datos de un usuario existente (nombre, correo, rol).

**Pasos de uso**:
1. Desde el listado de usuarios, elegir la acción de editar sobre un usuario.
2. Modificar los campos necesarios.
3. Confirmar.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Baja de usuario

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Da de baja lógica a un usuario. Si el usuario tenía leads activos asignados, el sistema los reasigna automáticamente a otro responsable disponible del mismo rol; si no hay ningún candidato disponible, la baja se rechaza para no dejar leads sin responsable.

**Pasos de uso**:
1. Desde el listado de usuarios, elegir la acción de dar de baja.
2. Confirmar la acción.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Restablecimiento de contraseña

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Permite a un administrador asignar una contraseña nueva a un usuario.

**Pasos de uso**:
1. Desde el listado de usuarios, elegir la acción de restablecer contraseña.
2. Ingresar la contraseña nueva.
3. Confirmar.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Alta de administrador de empresa

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Permite que el holding designe a una persona como administradora de una empresa específica del grupo, con acceso acotado a esa empresa únicamente.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: commit `a63553c` (frontend, `CrearAdministradorEmpresaDialog.tsx` — sin campo `rol`, implícito `ADMINISTRADOR` — disparado desde una tercera tarjeta "Nuevo administrador" en `EmpresaDetallePage.tsx`), contra `POST /empresas/:empresaId/administradores`. El endpoint llegó a `test/gpt` con el merge `main→test/gpt` (`f6ce0be`, 2026-08-30) — verificado presente en `backend/src/routes/usuarios.routes.ts`. Excepción de alcance documentada en `AGENTS.md` §7 (2026-08-30, Bloque F).

### Membresía por red social

**Estado**: ⏳ Pendiente (bloqueado por backend)

**Descripción funcional esperada**: Dentro de la ficha de un usuario asesor, permite restringir su visibilidad de leads a un canal/red social específico dentro de su empresa (por ejemplo, un asesor que solo atiende leads de Instagram).

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: requiere un cambio de modelo de datos en el backend, todavía no iniciado.

### Tab usuarios holding-wide vs. usuarios por empresa

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: En el listado de usuarios, separa la vista entre "usuarios del holding" (sin empresa asignada) y "usuarios de la empresa X" cuando se está viendo una empresa en particular.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: commit `a63553c` (frontend, toggle nuevo en `UsuariosFiltros.tsx`, visible solo para sesión `holding`), contra el parámetro `soloHoldingWide` de `GET /usuarios`. Llegó a `test/gpt` con el merge `main→test/gpt` (`f6ce0be`, 2026-08-30) — verificado presente en `backend/src/schemas/usuarios.schema.ts`. De paso, `RolUsuario` (frontend) se amplió a `SUPERVISOR_HOLDING`/`SUPER_ADMIN` (ya existentes en el enum de Prisma), visibles en la tabla y en este filtro. Excepción de alcance documentada en `AGENTS.md` §7 (2026-08-30, Bloque F).

---

## Gestión de Empresas / Holding

### Gestor de empresas (listado)

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Pantalla exclusiva de sesión holding — lista todas las empresas del grupo en un grid de tarjetas, con búsqueda por nombre y paginación.

**Pasos de uso**:
1. Ingresar desde el menú lateral, opción "Empresas" (solo visible en sesión holding).
2. Buscar una empresa por nombre (con debounce).
3. Navegar entre páginas de resultados (25 por página).
4. Editar la apariencia de una empresa desde su tarjeta.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: `GestorEmpresasPage.tsx` — rediseño a grid de tarjetas (commit `23069cd`) y agregado de paginación/búsqueda (commit `18752ee`), ambos en `origin/test/gpt`. Conectado a `GET /empresas` real, sin mocks.

### Gestor de empresas (cards con isotipo)

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Cada tarjeta del gestor de empresas muestra el isotipo de la empresa (o una inicial de respaldo si no tiene logo cargado), su nombre y un botón "Ver detalles".

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: mismo commit que el ítem anterior (`23069cd`) — es la misma entrega, no una pantalla separada.

### Detalle de empresa

**Estado**: 🚧 En curso — pantalla construida y pusheada, pero sin punto de entrada desde la navegación principal todavía

**Descripción funcional esperada**: Pantalla accesible desde el gestor de empresas — muestra accesos a los usuarios y los bridges de esa empresa específica.

**Pasos de uso (estado actual)**:
1. Hoy, el botón "Ver detalles" de cada tarjeta del gestor navega directo a `/usuarios?empresaId=...` (el atajo que ya existía en producción) y **no** pasa por esta pantalla de detalle.
2. La pantalla de detalle en sí (`/empresas/:empresaId`) existe y funciona si se accede directamente a esa URL — muestra el nombre de la empresa y enlaces a "Usuarios" y "Bridges" de esa empresa.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: `EmpresaDetallePage.tsx` está commiteado y pusheado (commit `1b43c8f`, `origin/test/gpt`), pero el gestor de empresas todavía no enlaza a esta pantalla — llegar a ella hoy requiere escribir la URL a mano. Además, según un comentario explícito en el propio código (`EmpresaDetallePage.tsx`), los enlaces a "Usuarios"/"Bridges" de esa empresa **todavía no filtran del lado del servidor** — el backend ignora el parámetro `empresaId` (gap ya reportado a Mateo, prioridad 1, según ese mismo comentario) y por ahora muestran el listado completo del holding sin acotar. **Pendiente de que Mateo confirme el estado actual de ese filtro server-side** antes de dar la pantalla por cerrada de punta a punta. También hay un límite de escala documentado en el código: la pantalla resuelve la empresa buscando en memoria sobre una página de hasta 500 registros (funciona a la escala real actual, ~478 empresas, pero no escalaría a miles).

### Acceder a empresa / salir de vista de empresa

**Estado**: ✅ Implementado y funcional (mecanismo distinto al descrito originalmente, ver nota)

**Descripción funcional**: Desde el gestor de empresas, el botón "Ver detalles" de una tarjeta pone al holding en "vista de esa empresa" (una vista de solo lectura simulada, no un cambio real de sesión); mientras está en ese modo, un botón flotante visible en toda la aplicación permite salir en cualquier momento y volver al panel general del holding.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: implementado sobre un query param (`?empresaId=`) centralizado en `useVistaEmpresa.ts`, consumido por `UsuariosPage.tsx` y `BridgesPage.tsx` para acotar su propio fetch, y por `SalirVistaEmpresaButton.tsx` (montado en `AppLayout.tsx`) para salir — commits `10f6dcb` (botón de salir) y `1b43c8f` (centralización del hook), ambos en `origin/test/gpt`. **Diferencia con la descripción original de este ítem**: "entrar" no ocurre desde la pantalla de "Detalle de empresa" (ítem anterior, todavía sin punto de entrada en la navegación) sino directamente desde la tarjeta del gestor de empresas — el resultado funcional (vista acotada + botón para salir) es el mismo. Por decisión de producto, sigue siendo una vista de solo lectura. Mismo gap de backend que el ítem anterior: el filtro por `empresaId` que el frontend ya envía todavía no lo aplica el servidor (pendiente de que Mateo lo confirme/cierre).

### Alta de empresa nueva

**Estado**: ⏳ Pendiente (bloqueado por backend)

**Descripción funcional esperada**: Permite al holding dar de alta una empresa nueva dentro del grupo.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: hoy no existe ninguna vía, ni de aplicación ni de backend, para crear una empresa nueva fuera de la configuración inicial del sistema — todas las empresas existentes se cargaron por ese medio, no por esta pantalla.

---

## Configuración / Apariencia

### Configuración de empresa (legacy)

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Pantalla de configuración general, remanente de una versión anterior de la aplicación previa al soporte de múltiples empresas.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: en revisión para confirmar si sigue vigente o si su función quedó reemplazada por "Apariencia de la propia empresa" (ítem siguiente).

### Apariencia de la propia empresa

**Estado**: ✅ Implementado y funcional

**Descripción funcional**: Permite a un administrador de empresa personalizar el nombre, los colores de marca y el isotipo que ve su propio equipo dentro de la aplicación.

**Pasos de uso**:
1. Ingresar desde el menú lateral, opción "Apariencia" (visible para Administrador en sesión de empresa).
2. Modificar nombre, colores y/o subir un isotipo nuevo.
3. Ver la vista previa en tiempo real antes de guardar.
4. Guardar los cambios.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_
