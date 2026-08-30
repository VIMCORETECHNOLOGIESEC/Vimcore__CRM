import { useState } from "react";
import { getErrorMessage } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/componentes/states/EmptyState";
import { ErrorState } from "@/componentes/states/ErrorState";
import { LoadingState } from "@/componentes/states/LoadingState";
import { usePageHeader } from "@/layouts/PageHeaderContext";
import { EditarEmpresaHoldingDialog } from "./EditarEmpresaHoldingDialog";
import type { EmpresaAparienciaHoldingView } from "./empresa-apariencia-holding.api";
import { useEmpresasHolding, useUpdateEmpresaAparienciaHolding } from "./useEmpresaAparienciaHolding";

/** Muestra el swatch de color junto al hex -- nunca solo el color (accesibilidad, docs/07 criterios transversales). */
function CeldaColor({ hex }: { hex: string | null }) {
  if (!hex) {
    return <span className="text-sm text-muted-foreground">Sin definir</span>;
  }
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded border border-border"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-sm">{hex}</span>
    </span>
  );
}

/**
 * Gestor de empresas de holding (`docs/blocks/d0-visualizacion-multitenant.md`,
 * PASO 8) -- ruta protegida exclusiva sessionScope `holding` + rol
 * `ADMINISTRADOR` (`router.tsx`). Lista TODAS las `Empresa` de la instancia
 * (`GET /empresas`, sin filtros ni paginación -- el backend ya las devuelve
 * completas y ordenadas por nombre) y permite abrir
 * `EditarEmpresaHoldingDialog` por fila para editar nombre/colores/isotipo
 * de cualquiera de ellas vía `PATCH /empresas/:empresaId/apariencia`.
 *
 * Distinta de `EmpresaAparienciaPage` (self-service, solo la propia empresa
 * de una sesión `company`) y de `ConfiguracionEmpresaPage` (branding global
 * de toda la instancia, no de una `Empresa` puntual) -- ver la nota de
 * colisión conceptual en el bloque D0.
 */
export function GestorEmpresasPage() {
  usePageHeader({ title: "Empresas" });

  const { data, isLoading, isError, error, refetch } = useEmpresasHolding();
  const actualizar = useUpdateEmpresaAparienciaHolding();

  const [empresaEnEdicion, setEmpresaEnEdicion] = useState<EmpresaAparienciaHoldingView | null>(
    null,
  );

  const empresas = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Todas las empresas de esta instancia. Editá el nombre y los colores de marca de
        cualquiera de ellas -- sus equipos ven el cambio reflejado en su propia pantalla de
        bienvenida.
      </p>

      {isLoading ? (
        <LoadingState rows={4} rowHeight="h-12" />
      ) : isError ? (
        <ErrorState message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : empresas.length === 0 ? (
        <EmptyState
          title="Todavía no hay empresas registradas"
          description="Las empresas se crean desde la configuración inicial de la instancia."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nombre</TableHead>
              <TableHead>Color primario</TableHead>
              <TableHead>Color secundario</TableHead>
              <TableHead>Isotipo</TableHead>
              <TableHead className="w-24 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empresas.map((empresa) => (
              <TableRow key={empresa.id}>
                <TableCell className="font-medium">{empresa.nombre}</TableCell>
                <TableCell>
                  <CeldaColor hex={empresa.colorPrimario} />
                </TableCell>
                <TableCell>
                  <CeldaColor hex={empresa.colorSecundario} />
                </TableCell>
                <TableCell>
                  {empresa.logoUrl ? (
                    <img
                      src={empresa.logoUrl}
                      alt={`Isotipo de ${empresa.nombre}`}
                      className="size-8 rounded object-contain"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">Sin isotipo</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Editar ${empresa.nombre}`}
                    onClick={() => setEmpresaEnEdicion(empresa)}
                  >
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {empresaEnEdicion ? (
        <EditarEmpresaHoldingDialog
          open
          onOpenChange={(abierto) => {
            if (!abierto) setEmpresaEnEdicion(null);
          }}
          empresa={empresaEnEdicion}
          enviando={actualizar.isPending}
          onSubmit={(valores) =>
            actualizar.mutate(
              { empresaId: empresaEnEdicion.id, input: valores },
              { onSuccess: () => setEmpresaEnEdicion(null) },
            )
          }
        />
      ) : null}
    </div>
  );
}
