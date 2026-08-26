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

## Estado consolidado (revisión estática contra código real, 2026-08-25)

| Módulo | Estado | Pendientes |
|---|---|---|
| F1 — Base | ✅ Completo | — |
| F2 — Autenticación | ✅ Completo (frontend) | Backend no expone autoservicio de cambio de contraseña para roles no-administrador (brecha de backend M2, no de este módulo) |
| F3 — Listado de leads | ⚠️ Implementado con brechas | Campaña usa un catálogo local y no se envía como relación canónica; el DTO real deja correo/campaña/cuenta sin dato; tabs "Pendientes/Cerrados" pendientes; el backend no emite `lead.nuevo` para actualizar todos los listados autorizados |
| F4 — Detalle del lead | ⚠️ Implementado con brechas | Correo principal, campaña y cuenta se mapean a `null`; `LeadTimeline` muestra formulario y cierre a usuarios con lectura pero sin edición; falta redirección ante 403 y la cobertura SSE es parcial |
| F5 — Dashboard | ✅ Completo | — (actualización en tiempo real vía SSE resuelta el 2026-08-19: `decodeKnownEvent` ya reconoce `metricas.actualizadas` y `useNotificacionesRealtime` invalida `["metricas"]`) |
| F6 — Notificaciones | ✅ Completo | — |
| F7 — Administración de usuarios | ✅ Completo | — |
| F8 — Administración de bridges | ✅ Completo | — |

**Lectura rápida:** todos los módulos tienen una interfaz implementada, pero F3 y
F4 no están cerrados de punta a punta. Sus brechas no son solo refinamientos de
tiempo real: también hay datos de origen/contacto que la adaptación actual
descarta y acciones de edición que se muestran a usuarios con acceso de solo
lectura.

---

## Brechas verificadas y prioridad

| Prioridad | Módulo | Brecha | Resultado esperado |
|---|---|---|---|
| P1 | F3/F4 | `mapLeadFromApi` fija `correoPrincipal`, `campania` y `cuentaPublicitaria` en `null`; el catálogo de campañas es local y el filtro no representa una relación real del backend. | Consumir un DTO que exponga correo principal y atribución canónica; retirar datos sintéticos y estados visuales inventados. |
| P1 | F4 | `LeadTimeline` y `FormularioEtapaLead` no reciben al usuario ni aplican un guard de edición. El asesor que conserva lectura después del traspaso sigue viendo formulario y botones de cierre; el backend recién rechaza al enviar. | Derivar capacidades entregadas por backend o aplicar un guard local equivalente como mejora de UX, sin tratarlo como control de seguridad. |
| P2 | F3/F4 | No existe un evento `lead.nuevo`; `lead.asignado` y `lead.etapa-cambiada` solo llegan al destinatario. | Invalidar listados/detalles de cada usuario autorizado cuando ingresa un lead. El futuro multi-tenant deberá emitir por tenant/empresa, no con un broadcast global sin alcance. |
| P2 | F3 | Faltan tabs "Pendientes/Cerrados". | Consumir `vista=activos|cerrados` cuando M5 lo implemente y mantener el filtrado server-side. |
| P2 | F4 | Ante `permiso_denegado`, la pantalla ofrece "Reintentar" aunque el acceso ya no puede recuperarse desde esa vista. | Redirigir a `/leads` con explicación accionable. |
| P3 | F2 | No existe autoservicio de cambio de contraseña para roles no-administrador. | Incorporar un endpoint de perfil que verifique la contraseña actual; el reset administrativo sigue siendo el workaround AS-IS. |

---

El diario de migración mock-a-real por módulo (F1-F8) que este documento
conservaba se retiró: `git log --follow` sobre `frontend/src/**` recupera esa
cronología completa. Este documento mantiene solo el estado consolidado
vigente.
