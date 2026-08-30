import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";

/**
 * Botón flotante "salir de vista de empresa" -- visible solo cuando hay una
 * `empresaVistaId` activa Y la sesión es holding-wide (el filtro de empresa
 * puntual no existe para una sesión `company`, que ya está acotada a la
 * suya). `GestorEmpresasPage.tsx` ("Ver detalles") ya navega hoy a
 * `/usuarios?empresaId=X`, así que este botón limpia esa vista de verdad --
 * no es un placeholder inerte.
 *
 * Consume `useVistaEmpresa()` (fuente de verdad compartida con
 * `EmpresaDetallePage`/`UsuariosPage`/`BridgesPage`, ver ese hook) en vez de
 * leer el query param directo -- mismo comportamiento observable que la
 * versión anterior de este componente (ambos implementados sobre
 * `useSearchParams`), ahora centralizado en un solo lugar.
 */
export function SalirVistaEmpresaButton() {
  const { user } = useAuth();
  const { empresaVistaId, salirDeEmpresa } = useVistaEmpresa();

  if (!empresaVistaId || user?.sessionScope !== "holding") {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={salirDeEmpresa}
      className="fixed bottom-4 right-4 z-50 gap-2 shadow-lg"
    >
      <Building2 className="size-4" aria-hidden="true" />
      Salir de vista de empresa
    </Button>
  );
}
