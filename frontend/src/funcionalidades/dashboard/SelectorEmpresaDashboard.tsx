import { useMemo } from "react";
import { useEmpresasHolding } from "@/funcionalidades/empresa-apariencia/useEmpresaAparienciaHolding";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { ResponsableCombobox } from "@/funcionalidades/leads/ResponsableCombobox";

/**
 * Un `pageSize` grande resuelve "todas las empresas" en una sola página, sin
 * paginación server-side en el combobox -- mismo criterio y misma escala real
 * confirmada (478 empresas) que `EmpresaDetallePage.tsx::EMPRESAS_PAGE_SIZE_DETALLE`.
 */
const EMPRESAS_PAGE_SIZE_SELECTOR = 500;

/** Sentinela de "sin acotar a una empresa" -- nunca se manda al backend, solo gobierna el combobox. */
export const VALOR_TODO_EL_HOLDING = "__TODO_EL_HOLDING__";

/**
 * Selector de empresa del dashboard (docs/23 item 14, "Dashboard con filtro
 * por empresa (holding)"). Exclusivo de `ADMINISTRADOR` + sesión
 * `holding` -- `DashboardPage.tsx` decide ese gate, este componente no lo
 * repite.
 *
 * Reusa exactamente el mecanismo ya en producción para "vista de empresa"
 * (`useVistaEmpresa`, `?empresaId=` en la URL -- mismo que
 * `EmpresaDetallePage.tsx`/`GestorEmpresasPage.tsx`/`ReportesPage.tsx`) y el
 * combobox genérico `ResponsableCombobox` (con su mecanismo de opción fija
 * `mostrarOpcionTodos` para "Todo el holding"), sin inventar un state ni un
 * control nuevo.
 *
 * Fuente de empresas: `useEmpresasHolding` (`GET /empresas`), restringido en
 * el backend a `sessionScope holding` + rol `ADMINISTRADOR` -- coherente con
 * el único gate que expone este selector.
 */
export function SelectorEmpresaDashboard() {
  const { empresaVistaId, entrarAEmpresa, salirDeEmpresa } = useVistaEmpresa();
  const { data } = useEmpresasHolding({ pageSize: EMPRESAS_PAGE_SIZE_SELECTOR });

  const empresas = useMemo(
    () => (data?.items ?? []).map((empresa) => ({ id: empresa.id, nombre: empresa.nombre })),
    [data],
  );

  function seleccionar(valor: string) {
    if (valor === VALOR_TODO_EL_HOLDING) {
      salirDeEmpresa();
    } else {
      entrarAEmpresa(valor);
    }
  }

  return (
    <ResponsableCombobox
      etiqueta="Empresa"
      ariaLabel="Empresa"
      valor={empresaVistaId ?? VALOR_TODO_EL_HOLDING}
      onChange={seleccionar}
      responsables={empresas}
      mostrarOpcionTodos
      valorOpcionTodos={VALOR_TODO_EL_HOLDING}
      etiquetaOpcionTodos="Todo el holding"
      etiquetaBotonOpcionTodos="Todo el holding"
      placeholderBusqueda="Buscar empresa…"
    />
  );
}
