import { createBrowserRouter, Navigate } from "react-router";
import { NotFoundPage } from "@/componentes/NotFoundPage";
import { BridgeDetallePage } from "@/funcionalidades/bridges/detalle/BridgeDetallePage";
import { BridgesPage } from "@/funcionalidades/bridges/BridgesPage";
import { EmpresaBridgesPage } from "@/funcionalidades/bridges/EmpresaBridgesPage";
import { LoginPage } from "@/funcionalidades/autenticacion/LoginPage";
import { ConfiguracionEmpresaPage } from "@/funcionalidades/configuracion-empresa/ConfiguracionEmpresaPage";
import { EmpresaAparienciaPage } from "@/funcionalidades/empresa-apariencia/EmpresaAparienciaPage";
import { EmpresaDetallePage } from "@/funcionalidades/empresa-apariencia/EmpresaDetallePage";
import { EmpresaUsuariosPage } from "@/funcionalidades/empresa-apariencia/EmpresaUsuariosPage";
import { GestorEmpresasPage } from "@/funcionalidades/empresa-apariencia/GestorEmpresasPage";
import { PerfilPage } from "@/funcionalidades/autenticacion/PerfilPage";
import { ProtectedRoute } from "@/funcionalidades/autenticacion/ProtectedRoute";
import { DashboardPage } from "@/funcionalidades/dashboard/DashboardPage";
import { LeadDetallePage } from "@/funcionalidades/leads/detalle/LeadDetallePage";
import { LeadsPage } from "@/funcionalidades/leads/LeadsPage";
import { LinkedInCallbackPage } from "@/funcionalidades/linkedin/LinkedInCallbackPage";
import { OportunidadDetallePage } from "@/funcionalidades/oportunidades/detalle/OportunidadDetallePage";
import { OportunidadesPage } from "@/funcionalidades/oportunidades/OportunidadesPage";
import { ReportesPage } from "@/funcionalidades/reportes/ReportesPage";
import { UsuariosPage } from "@/funcionalidades/usuarios/UsuariosPage";
import { ConversacionesPage } from "@/funcionalidades/whatsapp/ConversacionesPage";
import { WhatsAppCallbackPage } from "@/funcionalidades/whatsapp/WhatsAppCallbackPage";
import { AppLayout } from "@/layouts/AppLayout";
import { FlujoIntegracionDemo } from "@/temas/variante-empresarial/FlujoIntegracionDemo";
import { StyleguidePage } from "@/temas/variante-empresarial/StyleguidePage";

/**
 * Enrutado de la aplicación (docs/07 F1). React Router en modo de datos
 * (`createBrowserRouter`), sin el modo "framework" completo de
 * `@react-router/dev` -- ver la nota de decisión de arquitectura en el
 * informe de la tarea F1: este proyecto es una SPA sin SSR
 * (AGENTS.md §2, "Web responsive, sin app nativa"; sin mención de SSR en
 * ningún documento de alcance), y el modo framework exige convenciones de
 * archivos (`app/routes.ts`, compilador propio) incompatibles con la
 * estructura `frontend/src/` ya fijada en `docs/07-modulos-frontend.md`.
 * Los patrones de rutas anidadas, loaders/actions y navegación de la skill
 * `react-router-framework-mode` siguen aplicando igual en modo datos.
 *
 * F2 (login, perfil), F3 (listado de leads), F4 (detalle de lead), F5
 * (dashboard), F7 (administración de usuarios) y F8 (administración de
 * bridges) ya están implementados -- con F8 completo, ya no quedan módulos
 * pendientes de este roadmap sin al menos una implementación (ver la nota
 * de cierre en `docs/07-modulos-frontend.md`). F6 (notificaciones) no es una
 * ruta propia -- vive en la campana de `layouts/Header.tsx`.
 *
 * `/temas/*`: páginas de referencia (styleguide) de variantes de línea
 * gráfica en exploración (ver `frontend/src/temas/README.md`) -- dev-only,
 * solo en build de desarrollo (`import.meta.env.DEV`), sin sesión ni entrada
 * en `layouts/navigation.ts` a propósito: no debe aparecer en el sidebar de
 * producción ni compilarse en un build de producción.
 *
 * `/whatsapp/callback`: Paso 2 del flujo de conexión de WhatsApp Business
 * (`docs/contrato-frontend-whatsapp-api_mat_04.md`, secciones 1-3) --
 * pública a propósito, como `/iniciar-sesion`: Meta redirige ahí el
 * navegador del administrador de verdad, sin JWT (`GET /whatsapp/callback`
 * no exige `Authorization`, la identidad se recupera del `state`). Mismo
 * criterio que las rutas públicas ya existentes: fuera del árbol de
 * `ProtectedRoute`, sin guard adicional. El Paso 1 (botón "Conectar
 * WhatsApp") vive dentro de `BridgesPage.tsx` (`ConectarWhatsAppCard.tsx`),
 * ruta protegida ADMINISTRADOR ya existente -- no se agregó una ruta nueva
 * solo para eso.
 *
 * `/linkedin/callback`: mismo criterio que `/whatsapp/callback` de arriba --
 * pública, LinkedIn redirige acá el navegador de verdad (contrato,
 * `docs/contrato-frontend-linkedin-api_mat_05.md`, paso 2). A diferencia de
 * WhatsApp, el Paso 1 (botón "Conectar LinkedIn") vive DENTRO de
 * `BridgeDetallePage.tsx` (`LinkedInIntegracionSection.tsx`, ruta protegida
 * `bridges/:id` ya existente) porque LinkedIn Lead Sync cuelga de un
 * `Bridge` concreto -- no de "Bridges" en general como WhatsApp.
 *
 * `apariencia-empresa`: self-service de la propia `Empresa`
 * (`docs/blocks/d0-visualizacion-multitenant.md`, PASO 8) -- grupo de
 * `ProtectedRoute` separado del resto de rutas `ADMINISTRADOR` porque además
 * exige `allowedScopes={["company"]}`; una sesión `holding` con ese rol no
 * tiene una única empresa propia que editar por esta vía.
 *
 * `empresas`: gestor cross-empresa de holding (mismo PASO 8, `GET /empresas`
 * + `PATCH /empresas/:empresaId/apariencia`) -- otro grupo de
 * `ProtectedRoute` separado, exige `allowedScopes={["holding"]}` (el
 * espejo exacto del grupo de arriba: acá una sesión `company` no tiene
 * autoridad cross-empresa).
 */
export const router = createBrowserRouter([
  {
    path: "/iniciar-sesion",
    element: <LoginPage />,
  },
  {
    path: "/whatsapp/callback",
    element: <WhatsAppCallbackPage />,
  },
  {
    path: "/linkedin/callback",
    element: <LinkedInCallbackPage />,
  },
  ...(import.meta.env.DEV
    ? [
        { path: "/temas/empresarial", element: <StyleguidePage /> },
        { path: "/temas/empresarial/demo", element: <FlujoIntegracionDemo /> },
      ]
    : []),
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/panel" replace /> },
          { path: "panel", element: <DashboardPage /> },
          { path: "leads", element: <LeadsPage /> },
          {
            // Mismo gate real que Oportunidades/Bridges/Conversaciones: un
            // holding-wide no tiene un lead concreto para ver hasta "entrar"
            // a la vista de una empresa (`?empresaId=`, `useVistaEmpresa()`).
            // Prep de frontend para un bug real de backend en paralelo
            // (`leads.access.ts::canRead` sigue sin resolver `empresaId` acá
            // -- este gate por sí solo NO lo corrige, ver
            // `useLeadDetalle.ts`/`leadDetalle.api.ts`).
            element: <ProtectedRoute requiereVistaEmpresaSiHolding />,
            children: [{ path: "leads/:id", element: <LeadDetallePage /> }],
          },
          {
            // Conversaciones de WhatsApp (Parte 2): mismo gate real que
            // Oportunidades/Bridges -- un holding-wide no gestiona
            // conversaciones de ninguna empresa en particular hasta "entrar"
            // a la vista de una concreta.
            element: <ProtectedRoute requiereVistaEmpresaSiHolding />,
            children: [
              { path: "conversaciones", element: <ConversacionesPage /> },
              { path: "conversaciones/:id", element: <ConversacionesPage /> },
            ],
          },
          {
            // Oportunidades (Bloque D/E, gate holding-wide sin empresa): un
            // holding-wide (sesión `holding`) no gestiona oportunidades de
            // ninguna empresa en particular hasta "entrar" a la vista de una
            // concreta (`?empresaId=`, `useVistaEmpresa()`) -- mismo gate real
            // que Bridges más abajo, no solo cosmético del sidebar (ver
            // `AppSidebar.tsx`/`ProtectedRoute.tsx::requiereVistaEmpresaSiHolding`).
            // Sesión `company` no se ve afectada por este grupo.
            element: <ProtectedRoute requiereVistaEmpresaSiHolding />,
            children: [
              { path: "oportunidades", element: <OportunidadesPage /> },
              { path: "oportunidades/:id", element: <OportunidadDetallePage /> },
            ],
          },
          { path: "perfil", element: <PerfilPage /> },
          {
            element: <ProtectedRoute allowedRoles={["ADMINISTRADOR"]} />,
            children: [
              {
                // Mismo gate de vista de empresa que Oportunidades arriba,
                // anidado dentro del grupo ADMINISTRADOR-only ya existente
                // (Bridges sigue exigiendo ambas condiciones). Usuarios se
                // sumó al mismo gate: un holding-wide no gestiona cuentas de
                // ninguna empresa en particular hasta "entrar" a la vista de
                // una concreta (bug real de QA manual, routing roto dentro
                // de "Ver en vivo").
                element: <ProtectedRoute requiereVistaEmpresaSiHolding />,
                children: [
                  { path: "usuarios", element: <UsuariosPage /> },
                  { path: "bridges", element: <BridgesPage /> },
                  { path: "bridges/:id", element: <BridgeDetallePage /> },
                ],
              },
              { path: "configuracion-empresa", element: <ConfiguracionEmpresaPage /> },
            ],
          },
          {
            // Exportación de reportes (docs/23 item 15): el backend exige
            // requireRole("ADMINISTRADOR", "SUPERVISOR") en los 4 endpoints
            // de /reportes/jobs -- combinación de roles distinta del grupo
            // ADMINISTRADOR-only de arriba, por eso es su propio grupo.
            element: (
              <ProtectedRoute allowedRoles={["ADMINISTRADOR", "SUPERVISOR"]} />
            ),
            children: [{ path: "reportes", element: <ReportesPage /> }],
          },
          {
            // Self-service de apariencia de la PROPIA empresa (PASO 8):
            // exclusivo ADMINISTRADOR de sesión `company` -- a diferencia del
            // grupo de arriba, acá SÍ importa el scope (una sesión `holding`
            // con rol ADMINISTRADOR no tiene una única empresa propia que
            // editar por esta vía, ver `empresa-apariencia.controller.ts`).
            element: (
              <ProtectedRoute allowedRoles={["ADMINISTRADOR"]} allowedScopes={["company"]} />
            ),
            children: [{ path: "apariencia-empresa", element: <EmpresaAparienciaPage /> }],
          },
          {
            // Gestor cross-empresa de holding (PASO 8): exclusivo
            // ADMINISTRADOR de sesión `holding` -- espejo del grupo
            // `apariencia-empresa` de arriba, pero con `allowedScopes`
            // invertido (`["holding"]` en vez de `["company"]`).
            element: (
              <ProtectedRoute allowedRoles={["ADMINISTRADOR"]} allowedScopes={["holding"]} />
            ),
            children: [
              { path: "empresas", element: <GestorEmpresasPage /> },
              // Detalle de empresa (vista de solo lectura simulada, ver
              // `EmpresaDetallePage.tsx`) -- mismo grupo/`allowedScopes` que
              // `empresas`: un admin de sesión `company` nunca debería entrar
              // al detalle de OTRA empresa por acá, ni siquiera la propia
              // (para eso ya existe `apariencia-empresa`/`usuarios`/`bridges`
              // sin necesitar este id explícito en la URL).
              { path: "empresas/:empresaId", element: <EmpresaDetallePage /> },
              // Usuarios/Bridges de ESA empresa puntual (rutas propias,
              // reemplazan el redirect anterior a `/usuarios?empresaId=`/
              // `/bridges?empresaId=` -- la MISMA pantalla que un
              // holding-wide usa para sus propias cuentas/bridges
              // holding-wide, confuso al reusarla tal cual para el drill-down
              // de una empresa). Mismo grupo/`allowedScopes` que
              // `empresas/:empresaId` de arriba -- el `empresaId` fijo viene
              // del path, no de `?empresaId=` (`useVistaEmpresa`), así que no
              // hace falta el gate `requiereVistaEmpresaSiHolding` que sí usa
              // `bridges` más arriba.
              { path: "empresas/:empresaId/usuarios", element: <EmpresaUsuariosPage /> },
              { path: "empresas/:empresaId/bridges", element: <EmpresaBridgesPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
