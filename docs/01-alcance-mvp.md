# 01 — Alcance del MVP

Define la frontera del sistema mínimo funcional para una empresa. Un elemento
"fuera de alcance" no se construye aunque parezca fácil: cada adición desplaza
la fecha de entrega del núcleo.

---

## 1. Dentro del alcance

### 1.1 Captación (Fase 1)

- Ingesta de leads por webhook desde Meta (Facebook + Instagram), X y LinkedIn
- Bridge de pruebas con Google Forms para desarrollo y demostración
- Normalización de teléfono a formato E.164 y de correo a minúsculas
- Deduplicación por teléfono normalizado
- Persistencia de campos fijos (nombre, teléfono, correo) y campos variables
  del formulario de la campaña
- Captura automática de campaña y cuenta publicitaria desde el bridge
- Panel de administración de bridges: alta de cuentas publicitarias, carga y
  renovación de tokens, estado de conexión y bitácora de errores de recepción

### 1.2 Gestión comercial (Fase 2)

- Autenticación usuario/contraseña con JWT, expuesta como API
- Cuatro roles con permisos diferenciados
- Asignación automática por carga de trabajo + asignación y reasignación manual
- Traspaso de lead de asesor a vendedor
- Cinco etapas: Nuevo, Contactado, Cita, Venta, No Venta (orden sugerido, no forzado)
- Formulario de seguimiento fijo por etapa
- Semáforo calculado automáticamente en todas las etapas
- Control de SLA de 24 h con estados A tiempo / En riesgo / Atrasado
- Notificaciones in-app: lead asignado, lead atrasado, recordatorio de cita
- Registro interno de citas con fecha y hora
- Listado de leads con filtros y vista de detalle
- Dashboard de KPIs con actualización en tiempo real
- Registro de auditoría de eventos del lead (no visible en interfaz, base de KPIs)

---

## 2. Fuera del alcance — con justificación

| Elemento | Razón de la exclusión | ¿Se prepara el terreno? |
|---|---|---|
| Multi-tenant y panel matriz | La fundación A-C ya está implementada en esquema compartido; panel matriz, routing por empresa, autoridad por membresía y dashboards jerárquicos siguen fuera del baseline funcional | Sí. `Empresa`/`Membresia`, ownership obligatorio, RLS, `TenantContext` y CAS ya existen; D0 hace visible la separación pre-despliegue, D/E completan el comportamiento post-despliegue y F retira el legado al final |
| Personalización de formularios y puntuación | Recorte explícito por tiempo y personal disponible | Sí. Los formularios y la rúbrica viven en un módulo aislado (`config/formularios.ts`) para que la migración a base de datos configurable no toque el resto |
| Módulo de remarketing | Definido como desarrollo futuro | Sí. No se elimina ni anonimiza ningún dato de lead, y la ventana de reingreso ya queda modelada |
| Exportación Excel / PDF | Incorporada posteriormente al MVP | Sí. El panel genera ambos formatos con los filtros activos, gráficos, resumen, conclusión y listado de leads |
| Calendarios externos | Solo se requiere registro interno | No |
| Correo / SMS / WhatsApp | Solo notificación in-app confirmada | Sí. La tabla `notificaciones` incluye columna `canal` con un único valor válido en el MVP |
| App móvil nativa | Se confirmó web responsive únicamente | No aplica |
| Bridge de TikTok | No incluido en la lista final del MVP | Sí. El contrato de ingesta es común; sumar TikTok es implementar un adaptador |
| Bridge de sitio web propio | Proyección a futuro | No. `RedSocial` no incluye `SITIO_WEB` y el endpoint genérico registra toda ingesta como `GOOGLE_FORMS`; primero debe extenderse el contrato de origen |
| SSO / OAuth corporativo | Lo desarrolla otro equipo | Sí. La autenticación se expone como API independiente y desacoplada |
| Timeline de interacciones en el detalle | Se confirmó que el detalle muestra el estado actual y su formulario | Sí. `lead_eventos` guarda todo; solo faltaría la vista |
| Catálogo de motivos de No Venta | Se confirmó observación en texto libre | Sí. La columna admite migrar a catálogo después |
| Anonimización o borrado por inactividad | Los datos son de interés para remarketing | No aplica |
| Consentimiento explícito del lead | El lead acepta términos en la plataforma publicitaria de origen | No aplica |

---

## 3. Riesgos abiertos y decisiones vencidas

R4 y R6 tenían como fecha límite original las fases `apply` y M6, pero esas
fases ya se ejecutaron sin una confirmación documentada del cliente en su
momento. El código AS-IS conserva los supuestos adoptados entonces; las
decisiones ya fueron resueltas en `docs/16` §8 (D5, D7, D8, D9). La fundación
A-C ya implementó esquema, membresías, ownership y aislamiento; D0 solo expone
esa separación antes del despliegue. El corte funcional de autoridad, handoff y
routing queda en D post-despliegue, los dashboards en E y el retiro legacy en F,
según la priorización aprobada en `3e8c70a`.

| # | Riesgo | Impacto | Acción sugerida |
|---|---|---|---|
| R1 | **X no ofrece API de formularios de lead nativos.** Sus Lead Generation Cards fueron descontinuadas; la captación en X se hace hoy hacia un formulario propio | El bridge de X no puede ser una integración de API oficial equivalente a la de Meta | Implementarlo como ingesta genérica con endpoint propio + atribución vía X Pixel/CAPI. Confirmar la expectativa con el cliente antes de comprometer la funcionalidad |
| R2 | LinkedIn Lead Gen Forms exige app aprobada en el LinkedIn Marketing Developer Platform, con proceso de revisión que puede tardar semanas | Bloquea la certificación del bridge de LinkedIn, no su desarrollo | Iniciar la solicitud de acceso **el primer día del proyecto**, en paralelo al desarrollo |
| R3 | Meta exige App Review con permisos `leads_retrieval` y `pages_manage_ads` | Igual que R2 | Iniciar App Review en paralelo; desarrollar contra cuentas de prueba mientras tanto |
| R4 | La regla de traspaso asesor→vendedor no fue definida con precisión por el cliente | M6 implementa un supuesto no confirmado; cambiarlo exige coordinar reglas, código y tests | **Resuelto en `docs/16` §8:** autoridad de cierre (D7), handoff automático (D8) y excepciones de reasignación (D9). El AS-IS vigente sigue descrito en `02-reglas-negocio.md` §5; el corte funcional quedó diferido a D post-despliegue |
| R5 | La rúbrica de puntuación del semáforo se construyó sobre práctica estándar de embudos comerciales, no sobre reglas dictadas por el cliente | Los umbrales pueden no reflejar su realidad comercial | Los umbrales viven en constantes aisladas. Revisar con el cliente tras las primeras dos semanas de uso real |
| R6 | Una persona puede necesitar actuar como asesor y vendedor, incluso con responsabilidades distintas por empresa; `RolUsuario` único no lo representa | `Membresia` ya expresa alcance y capacidades por empresa, pero la autoridad funcional aún depende de `Usuario.rol` y puede producir autoasignaciones ambiguas | **Resuelto en `docs/16` §8 (D5):** `rolSecundario` queda descartado y `Membresia` ya está implementada; falta el cutover funcional desde `Usuario.rol` en D y su retiro legacy en F |

---

## 4. Secuencia recomendada de construcción

El orden importa: cada bloque desbloquea al siguiente y permite demostrar avance.

1. **Base** — Esquema Prisma, autenticación, roles, CRUD de usuarios
2. **Ingesta** — Contrato de bridge + normalización + deduplicación + bridge de
   Google Forms (permite probar el embudo completo sin depender de App Reviews)
3. **Embudo** — Etapas, formularios, semáforo, historial de eventos
4. **Asignación** — Automática por carga, manual, traspaso, SLA
5. **Notificaciones** — In-app y SSE
6. **Dashboard** — KPIs y gráficas
7. **Bridges reales** — Meta, LinkedIn, X (sujetos a aprobación de plataforma)
8. **Panel de bridges** — Administración de tokens y bitácora

Poner Google Forms en el paso 2 es deliberado: desacopla el desarrollo del
embudo de los tiempos de aprobación de Meta y LinkedIn, que son el principal
riesgo de cronograma del proyecto.
