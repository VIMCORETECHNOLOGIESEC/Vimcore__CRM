import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmpresaAparienciaForm, type EmpresaAparienciaSubmitValues } from "./EmpresaAparienciaForm";

interface CrearEmpresaHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enviando: boolean;
  onSubmit: (valores: EmpresaAparienciaSubmitValues) => void;
}

/**
 * Alta de empresa nueva (docs/23 item 30, `POST /empresas`) -- exclusivo
 * sessionScope `holding`, mismo `EmpresaAparienciaForm` que
 * `EditarEmpresaHoldingDialog.tsx` (`mostrarNombre`, colores y logo
 * opcionales), pero arrancando de un formulario vacío en vez de precargado
 * con una `Empresa` existente. Invocado por el botón "Nueva empresa" desde
 * `GestorEmpresasPage.tsx`.
 */
export function CrearEmpresaHoldingDialog({
  open,
  onOpenChange,
  enviando,
  onSubmit,
}: CrearEmpresaHoldingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva empresa</DialogTitle>
          <DialogDescription>
            Da de alta una empresa nueva dentro de esta instancia -- puedes completar sus colores
            de marca ahora o dejarlos para después.
          </DialogDescription>
        </DialogHeader>

        <EmpresaAparienciaForm
          mostrarNombre
          valoresIniciales={{
            nombre: "",
            colorPrimario: null,
            colorSecundario: null,
            logoUrl: null,
          }}
          enviando={enviando}
          onSubmit={onSubmit}
          submitLabel="Crear empresa"
        />
      </DialogContent>
    </Dialog>
  );
}
