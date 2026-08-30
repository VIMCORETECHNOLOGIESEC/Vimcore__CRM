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
| 9 | Bridge API_EXTERNA (bridgeApi) | 🎨 | Bridges / Integraciones |
| 10 | Integración LinkedIn | ⏳ | Bridges / Integraciones |
| 11 | Integración WhatsApp Business (real) | ⏳ | Bridges / Integraciones |
| 12 | Dashboard de métricas (general) | ✅ | Dashboard y Métricas |
| 13 | Extensiones de dashboard (embudo de Oportunidad, rendimiento por producto) | ⏳ | Dashboard y Métricas |
| 14 | Dashboard con filtro por empresa (holding) | ⏳ | Dashboard y Métricas |
| 15 | Exportación de reportes (PDF/XLSX) | ⏳ | Reportes |
| 16 | Conexión de Meta Ads (métricas publicitarias reales) | ⏳ | Reportes |
| 17 | Listado y detalle de Oportunidad (negociación) | ⏳ | Negociación / Oportunidad |
| 18 | Listado de usuarios | ✅ | Usuarios y Membresías |
| 19 | Alta de usuario | 🚧 | Usuarios y Membresías |
| 20 | Edición de usuario | ✅ | Usuarios y Membresías |
| 21 | Baja de usuario (con reasignación de cartera) | ✅ | Usuarios y Membresías |
| 22 | Restablecimiento de contraseña | ✅ | Usuarios y Membresías |
| 23 | Alta de administrador de empresa | ⏳ | Usuarios y Membresías |
| 24 | Membresía por red social (asesor scopeado por canal) | ⏳ | Usuarios y Membresías |
| 25 | Tab usuarios holding-wide vs. usuarios por empresa | ⏳ | Usuarios y Membresías |
| 26 | Gestor de empresas (listado) | 🚧 | Gestión de Empresas / Holding |
| 27 | Gestor de empresas (cards con isotipo) | ⏳ | Gestión de Empresas / Holding |
| 28 | Detalle de empresa (usuarios y bridges de esa empresa) | ⏳ | Gestión de Empresas / Holding |
| 29 | Acceder a empresa / salir de vista de empresa | ⏳ | Gestión de Empresas / Holding |
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

**Estado**: 🎨 UI lista, sin conexión real

**Descripción funcional**: Permite conectar un bridge genérico contra una API externa no cubierta por los canales predefinidos.

**Pasos de uso esperados**:
1. Al dar de alta un bridge, elegir la opción "API externa" en vez de una red social predefinida.
2. Completar la configuración de conexión y el mapeo de campos.
3. Probar la conexión antes de guardar.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: la opción ya aparece en el selector de alta de bridge, pero la pantalla de configuración/mapeo todavía no está construida — el backend ya soporta esta funcionalidad de punta a punta.

### Integración LinkedIn

**Estado**: ⏳ Pendiente (sin frontend, backend listo)

**Descripción funcional esperada**: Conexión de una cuenta de LinkedIn Ads para sincronizar leads de formularios de LinkedIn de forma automática.

**Pasos de uso esperados**:
1. Conectar la cuenta de LinkedIn mediante autenticación OAuth.
2. Descubrir y elegir los formularios de captación a sincronizar.
3. Activar la suscripción para recibir leads nuevos automáticamente.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: contrato de integración ya definido y documentado formalmente (`docs/contrato-frontend-linkedin-api_mat_05.md`) — el backend está implementado y probado, falta únicamente construir esta interfaz.

### Integración WhatsApp Business (real)

**Estado**: ⏳ Pendiente (sin frontend real, backend listo)

**Descripción funcional esperada**: Conexión de una cuenta de WhatsApp Business para enviar y recibir mensajes reales desde la aplicación (ver también "Chat de WhatsApp en detalle de lead").

**Pasos de uso esperados**:
1. Conectar el número de WhatsApp Business mediante autenticación asistida (Embedded Signup de Meta).
2. Elegir el número a conectar.
3. A partir de ahí, los mensajes entrantes y salientes de ese número quedan disponibles desde el chat del detalle de lead.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: contrato ya definido (`docs/contrato-frontend-whatsapp-api_mat_04.md`) — el backend está implementado y probado. La interfaz de chat ya existe visualmente (ver arriba), falta la pantalla de conexión y conectar el chat a datos reales.

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

**Estado**: ⏳ Pendiente (sin frontend, backend listo)

**Descripción funcional esperada**: Ampliación del dashboard actual con el embudo de negociación sobre `Oportunidad` (en vez de `Lead`), rendimiento por producto y ranking de productos.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: sin contrato de frontend formalizado todavía — hace falta definirlo antes de construir la pantalla.

### Dashboard con filtro por empresa (holding)

**Estado**: ⏳ Pendiente (bloqueado por backend)

**Descripción funcional esperada**: Para una sesión de holding, permite elegir ver el dashboard general (todas las empresas agregadas) o filtrar la vista a una sola empresa puntual, mediante pestañas o un selector.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: el backend todavía no acepta un filtro de empresa en las consultas de métricas — pendiente de coordinación con el equipo de backend.

---

## Reportes

### Exportación de reportes (PDF/XLSX)

**Estado**: ⏳ Pendiente (sin frontend, backend listo)

**Descripción funcional esperada**: Generación y descarga de reportes comerciales en formato PDF o XLSX, con progreso visible mientras se generan.

**Pasos de uso esperados**:
1. Elegir el tipo de reporte y los parámetros (rango de fechas, filtros).
2. Solicitar la generación.
3. Ver el progreso de generación en tiempo real.
4. Descargar el archivo una vez listo (enlace de descarga temporal).

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: sin contrato de frontend formalizado todavía.

### Conexión de Meta Ads (métricas publicitarias reales)

**Estado**: ⏳ Pendiente (sin frontend, backend listo)

**Descripción funcional esperada**: Conexión de una cuenta de anuncios de Meta (Facebook/Instagram) para sincronizar métricas publicitarias reales (costo por lead, costo por clic, costo de adquisición) y cruzarlas con la conversión real del CRM.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: sin contrato de frontend formalizado todavía.

---

## Negociación / Oportunidad

### Listado y detalle de Oportunidad

**Estado**: ⏳ Pendiente (sin frontend, sin contrato)

**Descripción funcional esperada**: Nueva entidad de negociación, separada del Lead de captación — permite que un mismo cliente tenga varias negociaciones paralelas (una por producto). Incluye pool de asignación por empresa, autoridad de cierre restringida al asesor asignado, y excepción administrativa para reasignar.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: es el gap de frontend más grande del proyecto — cambio de modelo de datos completo, sin ningún contrato de frontend documentado todavía. El backend está implementado y probado.

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

**Estado**: ⏳ Pendiente (bloqueado por backend)

**Descripción funcional esperada**: Permite que el holding designe a una persona como administradora de una empresa específica del grupo, con acceso acotado a esa empresa únicamente.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: pendiente de que el backend habilite esta vía de creación (hoy solo existe como configuración manual de datos, no como una acción disponible desde la aplicación).

### Membresía por red social

**Estado**: ⏳ Pendiente (bloqueado por backend)

**Descripción funcional esperada**: Dentro de la ficha de un usuario asesor, permite restringir su visibilidad de leads a un canal/red social específico dentro de su empresa (por ejemplo, un asesor que solo atiende leads de Instagram).

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: requiere un cambio de modelo de datos en el backend, todavía no iniciado.

### Tab usuarios holding-wide vs. usuarios por empresa

**Estado**: ⏳ Pendiente (bloqueado por backend)

**Descripción funcional esperada**: En el listado de usuarios, separa la vista entre "usuarios del holding" (sin empresa asignada) y "usuarios de la empresa X" cuando se está viendo una empresa en particular.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

---

## Gestión de Empresas / Holding

### Gestor de empresas (listado)

**Estado**: 🚧 En desarrollo

**Descripción funcional**: Pantalla exclusiva de sesión holding — lista todas las empresas del grupo, con su nombre, colores de marca e isotipo.

**Pasos de uso (versión actual)**:
1. Ingresar desde el menú lateral, opción "Empresas" (solo visible en sesión holding).
2. Buscar una empresa por nombre.
3. Editar la apariencia de una empresa desde la tabla.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: está en proceso de rediseño hacia un formato de tarjetas (ver ítem siguiente) — la versión de tabla actual es transitoria.

### Gestor de empresas (cards con isotipo)

**Estado**: ⏳ Pendiente (en diseño)

**Descripción funcional esperada**: Reemplaza la tabla actual por un grid de tarjetas — cada una muestra el isotipo de la empresa, su nombre y un botón para ver el detalle/gestionar esa empresa.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

### Detalle de empresa

**Estado**: ⏳ Pendiente (en diseño)

**Descripción funcional esperada**: Pantalla nueva, accesible desde el gestor de empresas — muestra los usuarios y los bridges configurados de esa empresa específica, sin mezclarlos con los del resto del holding.

**Pasos de uso esperados**:
1. Desde el gestor de empresas, elegir "Ver detalles" sobre una tarjeta.
2. Revisar la pestaña de usuarios de esa empresa.
3. Revisar la pestaña de bridges configurados de esa empresa.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: la administración de bridges queda restringida al rol Administrador, según la documentación de bridges del proyecto.

### Acceder a empresa / salir de vista de empresa

**Estado**: ⏳ Pendiente (en diseño)

**Descripción funcional esperada**: Desde el detalle de una empresa, un botón permite "entrar" a verla en detalle; mientras se está en ese modo, un botón flotante permite salir en cualquier momento y volver al panel general del holding.

**Captura de pantalla**: _[CAPTURA PENDIENTE]_

**Notas técnicas**: por decisión de producto, esta es una vista de solo lectura (no un cambio real de sesión) — el holding consulta los datos de esa empresa, no actúa como si fuera un usuario de esa empresa.

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
