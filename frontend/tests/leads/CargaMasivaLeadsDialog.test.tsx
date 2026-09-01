import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanalManual } from "@/funcionalidades/leads/canal-manual.api";
import type { CargaMasivaBody, CargaMasivaResponse } from "@/funcionalidades/leads/carga-masiva.api";
import type { FilaCargaMasivaParseada } from "@/funcionalidades/leads/carga-masiva.utils";

vi.mock("@/funcionalidades/leads/carga-masiva.api", () => ({
  crearLeadsMasivoApi: vi.fn(),
  CARGA_MASIVA_MAX_LEADS_POR_TANDA: 100,
}));
// `useVistaEmpresa` (consumido por `CargaMasivaLeadsDialog` para leer
// `?empresaId=`) ahora también llama `useAuth()` -- mockeado acá con una
// sesión `company` estable (mismo patrón que
// `tests/layouts/SalirVistaEmpresaButton.test.tsx`/`tests/bridges/BridgesPage.test.tsx`).
// Ningún test de este archivo depende de `esVistaSoloLectura` en sí.
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: () => ({ user: { sessionScope: "company" } }),
}));

vi.mock("@/funcionalidades/leads/carga-masiva.utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/funcionalidades/leads/carga-masiva.utils")>();
  return {
    ...original,
    parsearExcelCargaMasiva: vi.fn(),
    descargarTemplateCargaMasiva: vi.fn(),
  };
});

const cargaMasivaApi = await import("@/funcionalidades/leads/carga-masiva.api");
const cargaMasivaUtils = await import("@/funcionalidades/leads/carga-masiva.utils");
const { CargaMasivaLeadsDialog } = await import("@/funcionalidades/leads/CargaMasivaLeadsDialog");

const crearLeadsMasivoApiMock = vi.mocked(cargaMasivaApi.crearLeadsMasivoApi);
const parsearExcelCargaMasivaMock = vi.mocked(cargaMasivaUtils.parsearExcelCargaMasiva);
const descargarTemplateCargaMasivaMock = vi.mocked(cargaMasivaUtils.descargarTemplateCargaMasiva);

function canalFake(overrides: Partial<CanalManual> = {}): CanalManual {
  return {
    id: "canal-1",
    empresaId: "empresa-1",
    nombre: "Referido",
    activo: true,
    creadoEn: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function filaFake(overrides: Partial<FilaCargaMasivaParseada> = {}): FilaCargaMasivaParseada {
  return {
    filaExcel: 2,
    nombre: "María Cabrera",
    telefono: "0991234567",
    correo: undefined,
    invalida: false,
    ...overrides,
  };
}

function excelFake(): File {
  return new File(["contenido"], "leads.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * `MemoryRouter` real (no un mock de `useVistaEmpresa`) para poder probar
 * `?empresaId=` de verdad -- mismo criterio que
 * `tests/whatsapp/ConectarWhatsAppCard.test.tsx`. Sin `?empresaId=` en
 * `initialEntries`, `useVistaEmpresa().empresaVistaId` es `null` (caso real
 * hoy: `LeadsPage.tsx` solo monta este diálogo para sesión `company`).
 *
 * `QueryClientProvider` real (backend real, `useCargaMasivaLeads.ts` invalida
 * `["leads"]` con `useQueryClient()` al terminar una carga exitosa) -- sin
 * esto el hook lanza "No QueryClient set" al renderizar.
 */
function renderDialog(canales: CanalManual[] = [canalFake()], initialEntries: string[] = ["/leads"]) {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <CargaMasivaLeadsDialog open onOpenChange={onOpenChange} canales={canales} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onOpenChange, queryClient };
}

beforeEach(() => {
  crearLeadsMasivoApiMock.mockReset();
  parsearExcelCargaMasivaMock.mockReset();
  descargarTemplateCargaMasivaMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CargaMasivaLeadsDialog — template", () => {
  it("«Descargar template» dispara la descarga del Excel de columnas fijas", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Descargar template" }));

    expect(descargarTemplateCargaMasivaMock).toHaveBeenCalledTimes(1);
  });
});

describe("CargaMasivaLeadsDialog — subida y vista previa", () => {
  it("al subir un archivo válido, muestra cuántas filas válidas/inválidas se detectaron antes de enviar nada", async () => {
    parsearExcelCargaMasivaMock.mockResolvedValue({
      filas: [filaFake({ filaExcel: 2 }), filaFake({ filaExcel: 3, invalida: true, telefono: undefined, motivoInvalida: "Faltan teléfono y correo." })],
      validas: [filaFake({ filaExcel: 2 })],
      invalidas: [filaFake({ filaExcel: 3, invalida: true, telefono: undefined, motivoInvalida: "Faltan teléfono y correo." })],
    });
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText("Archivo Excel"), excelFake());

    expect(await screen.findByText(/1 fila válida/)).toBeInTheDocument();
    expect(screen.getByText(/1 fila inválida/)).toBeInTheDocument();
    expect(screen.getByText(/Fila 3: Faltan teléfono y correo\./)).toBeInTheDocument();
    expect(crearLeadsMasivoApiMock).not.toHaveBeenCalled();
  });

  it("un archivo que no se puede leer muestra un mensaje accionable, nunca un error crudo", async () => {
    parsearExcelCargaMasivaMock.mockRejectedValue(new Error("archivo corrupto"));
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText("Archivo Excel"), excelFake());

    expect(
      await screen.findByText(/No se pudo leer el archivo\. Verifica que sea un Excel válido/),
    ).toBeInTheDocument();
  });

  it("sin filas válidas, el botón de carga queda deshabilitado", async () => {
    parsearExcelCargaMasivaMock.mockResolvedValue({
      filas: [filaFake({ invalida: true, telefono: undefined, motivoInvalida: "Faltan teléfono y correo." })],
      validas: [],
      invalidas: [filaFake({ invalida: true, telefono: undefined, motivoInvalida: "Faltan teléfono y correo." })],
    });
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText("Archivo Excel"), excelFake());

    expect(await screen.findByText(/0 filas válidas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar 0 leads" })).toBeDisabled();
  });
});

describe("CargaMasivaLeadsDialog — envío en tandas", () => {
  it("con menos de 100 filas válidas, manda una única tanda con el canal de lote elegido", async () => {
    parsearExcelCargaMasivaMock.mockResolvedValue({
      filas: [filaFake({ filaExcel: 2 })],
      validas: [filaFake({ filaExcel: 2, nombre: "María Cabrera", telefono: "0991234567" })],
      invalidas: [],
    });
    crearLeadsMasivoApiMock.mockResolvedValue({
      resumen: { solicitados: 1, creados: 1, duplicados: 0, fallidos: 0 },
      resultados: [{ fila: 1, estado: "creado", leadId: "lead-9" }],
    });
    const user = userEvent.setup();
    const { queryClient } = renderDialog([canalFake({ id: "canal-9", nombre: "Feria/evento" })]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await user.upload(screen.getByLabelText("Archivo Excel"), excelFake());
    await screen.findByText(/1 fila válida/);

    await user.click(screen.getByRole("combobox", { name: "Canal del lote" }));
    await user.click(await screen.findByRole("option", { name: "Feria/evento" }));

    await user.click(screen.getByRole("button", { name: "Cargar 1 lead" }));

    await waitFor(() => expect(crearLeadsMasivoApiMock).toHaveBeenCalledTimes(1));
    expect(crearLeadsMasivoApiMock).toHaveBeenCalledWith({
      empresaId: undefined,
      canalManualId: "canal-9",
      leads: [{ nombre: "María Cabrera", telefono: "0991234567", correo: undefined, canalManualId: undefined }],
    });
    expect(await screen.findByText("Creados:")).toBeInTheDocument();
    // Backend real: los leads recién creados deben aparecer en `LeadsPage.tsx`
    // sin recargar la página a mano (ver `useCargaMasiva.ts`).
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["leads"] });
  });

  it("con `?empresaId=` activo (vista de empresa holding-wide), lo manda en el body", async () => {
    parsearExcelCargaMasivaMock.mockResolvedValue({
      filas: [filaFake({ filaExcel: 2 })],
      validas: [filaFake({ filaExcel: 2, nombre: "María Cabrera", telefono: "0991234567" })],
      invalidas: [],
    });
    crearLeadsMasivoApiMock.mockResolvedValue({
      resumen: { solicitados: 1, creados: 1, duplicados: 0, fallidos: 0 },
      resultados: [{ fila: 1, estado: "creado", leadId: "lead-9" }],
    });
    const user = userEvent.setup();
    renderDialog([canalFake()], ["/leads?empresaId=empresa-holding-1"]);

    await user.upload(screen.getByLabelText("Archivo Excel"), excelFake());
    await screen.findByText(/1 fila válida/);

    await user.click(screen.getByRole("button", { name: "Cargar 1 lead" }));

    await waitFor(() => expect(crearLeadsMasivoApiMock).toHaveBeenCalledTimes(1));
    expect(crearLeadsMasivoApiMock).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: "empresa-holding-1" }),
    );
  });

  it("con más de 100 filas válidas, particiona en varias tandas secuenciales (nunca en paralelo)", async () => {
    const validas = Array.from({ length: 150 }, (_, i) =>
      filaFake({ filaExcel: i + 2, nombre: `Lead ${i + 1}`, telefono: `099${i}` }),
    );
    parsearExcelCargaMasivaMock.mockResolvedValue({ filas: validas, validas, invalidas: [] });

    let resolverPrimeraTanda: (value: CargaMasivaResponse) => void = () => {};
    const primeraTandaPromise = new Promise<CargaMasivaResponse>((resolve) => {
      resolverPrimeraTanda = resolve;
    });
    crearLeadsMasivoApiMock.mockImplementationOnce(() => primeraTandaPromise);
    crearLeadsMasivoApiMock.mockImplementationOnce(() =>
      Promise.resolve({
        resumen: { solicitados: 50, creados: 50, duplicados: 0, fallidos: 0 },
        resultados: Array.from({ length: 50 }, (_, i) => ({
          fila: i + 1,
          estado: "creado" as const,
          leadId: `lead-tanda2-${i}`,
        })),
      }),
    );

    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText("Archivo Excel"), excelFake());
    await screen.findByText(/150 filas válidas/);

    await user.click(screen.getByRole("button", { name: "Cargar 150 leads" }));

    // Mientras la primera tanda está pendiente, la segunda todavía no se disparó (secuencial, no en paralelo).
    expect(await screen.findByText("Enviando tanda 1 de 2…")).toBeInTheDocument();
    expect(crearLeadsMasivoApiMock).toHaveBeenCalledTimes(1);

    resolverPrimeraTanda({
      resumen: { solicitados: 100, creados: 100, duplicados: 0, fallidos: 0 },
      resultados: Array.from({ length: 100 }, (_, i) => ({
        fila: i + 1,
        estado: "creado" as const,
        leadId: `lead-tanda1-${i}`,
      })),
    });

    await waitFor(() => expect(crearLeadsMasivoApiMock).toHaveBeenCalledTimes(2));
    const [primeraLlamada, segundaLlamada] = crearLeadsMasivoApiMock.mock.calls as [CargaMasivaBody][];
    expect(primeraLlamada[0].leads).toHaveLength(100);
    expect(segundaLlamada[0].leads).toHaveLength(50);

    await waitFor(() => expect(screen.getByText("Solicitados:")).toBeInTheDocument());
    expect(screen.getByText("Solicitados:").parentElement).toHaveTextContent("Solicitados: 150");
  });
});

describe("CargaMasivaLeadsDialog — resumen final y mapeo de fila real", () => {
  it("muestra el resumen final y las filas con error con el NÚMERO REAL de fila del Excel, no el índice del array enviado", async () => {
    // Simula una segunda tanda: la fila con error es la tercera fila de la
    // SEGUNDA tanda (índice de array 3 dentro de esa tanda -> filaExcel real
    // 103, porque la primera tanda ya mandó 100 filas + fila 1 de encabezado
    // + 1 = offset 102 antes de esta tanda).
    const primeraTanda = Array.from({ length: 100 }, (_, i) => filaFake({ filaExcel: i + 2 }));
    const segundaTanda = Array.from({ length: 5 }, (_, i) => filaFake({ filaExcel: i + 102 }));
    const validas = [...primeraTanda, ...segundaTanda];
    parsearExcelCargaMasivaMock.mockResolvedValue({ filas: validas, validas, invalidas: [] });

    crearLeadsMasivoApiMock.mockImplementationOnce(() =>
      Promise.resolve({
        resumen: { solicitados: 100, creados: 100, duplicados: 0, fallidos: 0 },
        resultados: Array.from({ length: 100 }, (_, i) => ({
          fila: i + 1,
          estado: "creado" as const,
          leadId: `lead-${i}`,
        })),
      }),
    );
    crearLeadsMasivoApiMock.mockImplementationOnce(() =>
      Promise.resolve({
        resumen: { solicitados: 5, creados: 4, duplicados: 0, fallidos: 1 },
        resultados: [
          { fila: 1, estado: "creado" as const, leadId: "lead-a" },
          { fila: 2, estado: "creado" as const, leadId: "lead-b" },
          // Fila 3 de ESTE request (índice de array) -> filaExcel real 104
          // (segundaTanda[2].filaExcel === 104, ver arriba).
          { fila: 3, estado: "error" as const, motivo: "telefono y correo ausentes" },
          { fila: 4, estado: "creado" as const, leadId: "lead-d" },
          { fila: 5, estado: "creado" as const, leadId: "lead-e" },
        ],
      }),
    );

    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText("Archivo Excel"), excelFake());
    await screen.findByText(/105 filas válidas/);

    await user.click(screen.getByRole("button", { name: "Cargar 105 leads" }));

    await waitFor(() => expect(crearLeadsMasivoApiMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Fallidos:")).toBeInTheDocument();
    expect(await screen.findByText(/Fila 104: telefono y correo ausentes/)).toBeInTheDocument();
  });
});

describe("CargaMasivaLeadsDialog — cancelar/cerrar", () => {
  it("«Cancelar» antes de subir nada llama a onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
