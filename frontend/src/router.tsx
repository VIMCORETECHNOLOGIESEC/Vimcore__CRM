import { createBrowserRouter, Navigate } from "react-router";
import { NotFoundPage } from "@/componentes/NotFoundPage";
import { PendingScreen } from "@/componentes/PendingScreen";
import { LoginPage } from "@/funcionalidades/autenticacion/LoginPage";
import { PerfilPage } from "@/funcionalidades/autenticacion/PerfilPage";
import { ProtectedRoute } from "@/funcionalidades/autenticacion/ProtectedRoute";
import { DashboardPage } from "@/funcionalidades/dashboard/DashboardPage";
import { LeadDetallePage } from "@/funcionalidades/leads/detalle/LeadDetallePage";
import { LeadsPage } from "@/funcionalidades/leads/LeadsPage";
import { AppLayout } from "@/layouts/AppLayout";

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
 * Las pantallas de los módulos aún no implementados (F6-F8) son marcadores
 * de posición (`PendingScreen`); F2 (login, perfil), F3 (listado de leads),
 * F4 (detalle de lead) y F5 (dashboard) ya están implementados.
 */
export const router = createBrowserRouter([
  {
    path: "/iniciar-sesion",
    element: <LoginPage />,
  },
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
              {
                path: "usuarios",
                element: <PendingScreen module="F7 — Administración de usuarios" />,
              },
              {
                path: "bridges",
                element: <PendingScreen module="F8 — Administración de bridges" />,
              },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
