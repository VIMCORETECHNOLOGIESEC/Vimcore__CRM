# 07 — Módulos frontend y checklist de avance

React + TypeScript + Tailwind CSS. Web responsive, interfaz exclusivamente en
español.

Línea gráfica, paleta, librerías de UI candidatas y flujo de mockups por
módulo: ver `docs/09-linea-grafica-frontend.md`.

Skills de agente IA instaladas para el desarrollo de este frontend (lista,
instalación y cuándo usar cada una): ver `docs/10-skills-agente-frontend.md`.

---

## Estructura

```
frontend/src/
├── api/            Clientes HTTP y hooks de TanStack Query
├── componentes/    Componentes reutilizables
├── funcionalidades/
│   ├── autenticacion/
│   ├── leads/
│   ├── dashboard/
│   ├── usuarios/
│   ├── bridges/
│   └── notificaciones/
├── layouts/
├── hooks/
├── tipos/          Tipos compartidos con el backend
└── utils/
```

---

## F1 — Base

> **Progreso:** implementado en `configuracion-base-monorepo` (PR1
> `feat/configuracion-base-backend`, PR2 `feat/configuracion-base-frontend`),
> verificado PASS con 2 advertencias no bloqueantes (deriva de pnpm entre
> `onlyBuiltDependencies` y `allowBuilds`; reinstalación completa de pnpm en el
> primer arranque del contenedor). Tailwind fijado en v3 (no v4), para evitar
> el binario nativo `oxide`.

- [x] Vite + React + TypeScript + Tailwind
- [ ] Enrutado con React Router y rutas protegidas por rol
- [ ] TanStack Query configurado con manejo global de errores
- [ ] Cliente HTTP con inyección de JWT y refresco automático ante 401
- [ ] Layout principal: barra lateral, encabezado, campana de notificaciones
- [ ] Diseño responsive con puntos de corte móvil, tableta y escritorio
- [ ] Estados de carga (esqueletos), vacío y error en cada vista
- [ ] Paleta base neutra y tipografía legible; sin manual de marca disponible,
      se prioriza claridad y contraste sobre expresividad (línea gráfica
      propuesta en `docs/09-linea-grafica-frontend.md`)

---

## F2 — Autenticación

- [ ] Pantalla de inicio de sesión
- [ ] Persistencia de sesión y cierre automático al expirar el refresh
- [ ] Redirección post-login según rol
- [ ] Pantalla de perfil con cambio de contraseña

---

## F3 — Listado de leads

Es la pantalla de trabajo diario. Su rendimiento percibido define la experiencia
del producto.

- [ ] Tabla con columnas: cliente, teléfono, red social, campaña, etapa,
      semáforo, responsable, estado de SLA, fecha de ingreso
- [ ] Indicador de semáforo con color **y** etiqueta de texto
- [ ] Contador de SLA en vivo con formato `HH:MM:SS`, actualizado en cliente
- [ ] Distintivo visual para leads de reingreso
- [ ] Filtros combinables: etapa, semáforo, red social, campaña, responsable,
      rango de fechas, estado de SLA
- [ ] Búsqueda por nombre, teléfono o correo
- [ ] Paginación del lado del servidor
- [ ] Vista adaptada por rol: asesor y vendedor ven solo su cartera, sin columna
      de responsable
- [ ] Acciones masivas de asignación para supervisor y administrador
- [ ] Actualización por SSE cuando ingresa un lead nuevo

> El contador de SLA se calcula en el cliente a partir de la marca de tiempo
> recibida. No consultes al servidor cada segundo: a 100 concurrentes eso son
> 100 peticiones por segundo para mostrar un reloj.

---

## F4 — Detalle del lead

Muestra el **estado actual** con su formulario, no un timeline de interacciones.

- [ ] Encabezado: nombre, semáforo, etapa, responsable, contador de SLA
- [ ] Datos de contacto: teléfono, correos asociados, marca de dato inválido
- [ ] Origen: red social, campaña, cuenta publicitaria, fecha de ingreso
- [ ] Campos dinámicos del formulario de la campaña
- [ ] Formulario de la etapa vigente con cálculo de puntuación
- [ ] Guía de acción según el color del semáforo
- [ ] Selector de cambio de etapa que abre el formulario correspondiente
- [ ] Acción de traspaso a vendedor (asesor, desde etapa Contactado)
- [ ] Acción de reasignación con la regla de semáforo aplicada
- [ ] Panel de citas: agendar, reprogramar, marcar resultado
- [ ] Campos de cierre para Venta y No Venta con validación

---

## F5 — Dashboard

- [ ] Tarjetas de resumen: total de leads, en gestión, cerrados, tasa de
      conversión, tiempo promedio de primera respuesta, tiempo promedio de cierre
- [ ] Gráfica de barras: leads por red social
- [ ] Gráfica de barras: leads por asesor
- [ ] Gráfica de embudo: leads por etapa
- [ ] Gráfica de barras: leads por campaña
- [ ] Gráfica de barras apiladas: red social × semáforo (la que responde de qué
      red llegan los leads con más probabilidad de cierre)
- [ ] Selector de rango de fechas con comparativa contra el período anterior
- [ ] Alcance por rol: general para administrador y supervisor, personal para
      asesor y vendedor
- [ ] Actualización en tiempo real vía SSE

**Biblioteca de gráficas:** Recharts. Es declarativa, tipada, y su tamaño de
paquete es razonable para el volumen de gráficas de este dashboard.

---

## F6 — Notificaciones

- [ ] Campana con contador de no leídas
- [ ] Panel desplegable con listado y navegación al lead relacionado
- [ ] Marcar como leída, individual y masivo
- [ ] Aviso emergente al llegar una notificación por SSE
- [ ] Indicador de reconexión cuando el canal SSE se interrumpe

---

## F7 — Administración de usuarios

Solo administrador.

- [ ] Listado con rol, estado y carga activa de leads
- [ ] Alta y edición de usuario
- [ ] Baja lógica con reasignación obligatoria de la cartera activa
- [ ] Restablecimiento de contraseña

---

## F8 — Administración de bridges

Solo administrador.

- [ ] Listado con estado, último lead recibido y expiración de token
- [ ] Detalle con cuentas publicitarias asociadas
- [ ] Formulario de carga y renovación de token con verificación inmediata
- [ ] Botón de prueba de conexión
- [ ] Bitácora de errores con filtro por nivel y fecha
- [ ] Aviso destacado ante token expirado o bridge sin actividad

> El campo de token siempre se muestra vacío, nunca precargado. Se envía solo al
> guardar.

---

## Criterios transversales de calidad

- **Accesibilidad:** el semáforo nunca se comunica solo por color. Etiqueta de
  texto siempre presente, para daltonismo y para lectores de pantalla.
- **Estados de error:** toda petición fallida muestra un mensaje accionable en
  español, no un código HTTP.
- **Confirmaciones:** las acciones irreversibles (cierre de lead, baja de
  usuario) exigen confirmación explícita.
- **Formato de fechas:** `DD/MM/AAAA HH:mm` en zona horaria local del navegador.
- **Formato de moneda:** dólar estadounidense con separador de miles.
- **Sin bloqueo de interfaz:** ninguna operación deja la pantalla congelada sin
  indicador de progreso.
