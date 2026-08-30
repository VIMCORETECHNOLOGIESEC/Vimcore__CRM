import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmpresaAparienciaForm, type EmpresaAparienciaSubmitValues } from "./EmpresaAparienciaForm";
import type { EmpresaAparienciaHoldingView } from "./empresa-apariencia-holding.api";

interface EditarEmpresaHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: EmpresaAparienciaHoldingView;
  enviando: boolean;
  onSubmit: (valores: EmpresaAparienciaSubmitValues) => void;
}

/**
 * Editor cross-empresa de holding (`docs/blocks/d0-visualizacion-multitenant.md`,
 * PASO 8) -- exclusivo sessionScope `holding`, edita nombre/colorPrimario/
 * colorSecundario/logoUrl de la `Empresa` recibida vía `PATCH /empresas/:empresaId/
 * apariencia`. Invocado por fila desde `GestorEmpresasPage.tsx` (listado de
 * `GET /empresas`).
 */
export function EditarEmpresaHoldingDialog({
  open,
  onOpenChange,
  empresa,
  enviando,
  onSubmit,
}: EditarEmpresaHoldingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar apariencia de {empresa.nombre}</DialogTitle>
          <DialogDescription>
            Cambios exclusivos de administración de holding -- afectan a esta empresa, no a la
            tuya.
          </DialogDescription>
        </DialogHeader>

        <EmpresaAparienciaForm
          mostrarNombre
          valoresIniciales={{
            nombre: empresa.nombre,
            colorPrimario: empresa.colorPrimario,
            colorSecundario: empresa.colorSecundario,
            logoUrl: empresa.logoUrl,
          }}
          enviando={enviando}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
