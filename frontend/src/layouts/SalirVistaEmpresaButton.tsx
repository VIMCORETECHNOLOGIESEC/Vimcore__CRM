import { Building2 } from "lucide-react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";

/**
 * Botón flotante "salir de vista de empresa" -- visible solo cuando la URL
 * actual trae `?empresaId=` Y la sesión es holding-wide (el filtro de
 * empresa puntual no existe para una sesión `company`, que ya está acotada
 * a la suya). `GestorEmpresasPage.tsx` ("Ver detalles") ya navega hoy a
 * `/usuarios?empresaId=X`, así que este botón limpia ese mismo query param
 * de verdad -- no es un placeholder inerte.
 *
 * INTERFAZ TEMPORAL (reparto de trabajo, ver `AppLayout.tsx`): cuando el
 * context compartido `empresaVistaId`/`entrarAEmpresa`/`salirDeEmpresa`
 * (otra sesión, en curso en paralelo) esté listo, este componente pasa a
 * consumirlo en vez de leer el query param directo -- cambio acotado a este
 * archivo, sin volver a tocar `AppLayout.tsx`.
 */
export function SalirVistaEmpresaButton() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const empresaId = searchParams.get("empresaId");

  if (!empresaId || user?.sessionScope !== "holding") {
    return null;
  }

  function salirDeEmpresa() {
    setSearchParams((prev) => {
      const siguiente = new URLSearchParams(prev);
      siguiente.delete("empresaId");
      return siguiente;
    });
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
