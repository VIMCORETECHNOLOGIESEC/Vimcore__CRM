import { createBrowserRouter, Navigate } from "react-router";
import { NotFoundPage } from "@/componentes/NotFoundPage";
import { BridgeDetallePage } from "@/funcionalidades/bridges/detalle/BridgeDetallePage";
import { BridgesPage } from "@/funcionalidades/bridges/BridgesPage";
import { LoginPage } from "@/funcionalidades/autenticacion/LoginPage";
import { PerfilPage } from "@/funcionalidades/autenticacion/PerfilPage";
import { ProtectedRoute } from "@/funcionalidades/autenticacion/ProtectedRoute";
import { DashboardPage } from "@/funcionalidades/dashboard/DashboardPage";
import { LeadDetallePage } from "@/funcionalidades/leads/detalle/LeadDetallePage";
import { LeadsPage } from "@/funcionalidades/leads/LeadsPage";
import { UsuariosPage } from "@/funcionalidades/usuarios/UsuariosPage";
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
 */
export const router = createBrowserRouter([
  {
    path: "/iniciar-sesion",
    element: <LoginPage />,
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
          { path: "leads/:id", element: <LeadDetallePage /> },
          { path: "perfil", element: <PerfilPage /> },
          {
            element: <ProtectedRoute allowedRoles={["ADMINISTRADOR"]} />,
            children: [
              { path: "usuarios", element: <UsuariosPage /> },
              { path: "bridges", element: <BridgesPage /> },
              { path: "bridges/:id", element: <BridgeDetallePage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
