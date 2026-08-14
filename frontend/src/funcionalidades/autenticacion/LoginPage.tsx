import { PendingScreen } from "@/componentes/PendingScreen";

/**
 * Destino de `ProtectedRoute` cuando no hay sesión iniciada. El formulario de
 * inicio de sesión real es alcance de F2 ("Pantalla de inicio de sesión",
 * docs/07) -- F1 solo entrega el enrutado hacia esta ruta pública.
 */
export function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-foreground">
          CRM Embudo de Leads
        </h1>
        <PendingScreen module="F2 — Autenticación (pantalla de inicio de sesión)" />
      </div>
    </main>
  );
}
