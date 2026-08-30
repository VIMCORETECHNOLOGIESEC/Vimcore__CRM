import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { OportunidadPlana, ProductoOportunidad } from "@/tipos/oportunidad";

vi.mock("@/funcionalidades/oportunidades/oportunidades.api", () => ({
  fetchProductosApi: vi.fn(),
  crearOportunidadApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const navigateMock = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }));

const oportunidadesApi = await import("@/funcionalidades/oportunidades/oportunidades.api");
const { NuevaOportunidadButton } = await import(
  "@/funcionalidades/oportunidades/NuevaOportunidadButton"
);

const fetchProductosApiMock = vi.mocked(oportunidadesApi.fetchProductosApi);
const crearOportunidadApiMock = vi.mocked(oportunidadesApi.crearOportunidadApi);

function productoFake(overrides: Partial<ProductoOportunidad> = {}): ProductoOportunidad {
  return {
    id: "prod-1",
    empresaId: "emp-1",
    nombre: "Departamento tipo A",
    activo: true,
    creadoEn: "2026-08-20T14:30:00.000Z",
    ...overrides,
  };
}

function oportunidadPlanaFake(overrides: Partial<OportunidadPlana> = {}): OportunidadPlana {
  return {
    id: "opp-9",
    leadId: "lead-1",
    empresaId: "emp-1",
    productoId: null,
    etapa: "NUEVO",
    semaforo: null,
    puntuacion: null,
    asesorId: null,
    vendedorId: null,
    montoVenta: null,
    observacionCierre: null,
    formaPago: null,
    slaInicioEn: null,
    cerradaEn: null,
    creadaEn: "2026-08-30T10:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function renderBoton() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NuevaOportunidadButton leadId="lead-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchProductosApiMock.mockResolvedValue([productoFake()]);
});

describe("NuevaOportunidadButton", () => {
  it("abre el diálogo y muestra el selector de producto poblado", async () => {
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));
    await user.click(screen.getByRole("combobox", { name: "Producto" }));

    expect(screen.getByRole("option", { name: "Sin producto" })).toBeInTheDocument();
    expect(await screen.findByText("Departamento tipo A")).toBeInTheDocument();
  });

  it("enviar con un producto elegido llama a crearOportunidadApi con el productoId", async () => {
    crearOportunidadApiMock.mockResolvedValue(oportunidadPlanaFake({ productoId: "prod-1" }));
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));
    await user.click(screen.getByRole("combobox", { name: "Producto" }));
    await user.click(await screen.findByText("Departamento tipo A"));
    await user.click(screen.getByRole("button", { name: "Crear oportunidad" }));

    expect(crearOportunidadApiMock.mock.calls[0]?.[0]).toEqual({
      leadId: "lead-1",
      productoId: "prod-1",
    });
  });

  it("enviar sin elegir producto llama a crearOportunidadApi con productoId undefined", async () => {
    crearOportunidadApiMock.mockResolvedValue(oportunidadPlanaFake());
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));
    await user.click(screen.getByRole("button", { name: "Crear oportunidad" }));

    expect(crearOportunidadApiMock.mock.calls[0]?.[0]).toEqual({
      leadId: "lead-1",
      productoId: undefined,
    });
  });

  it("al crear con éxito navega al detalle y muestra un toast", async () => {
    crearOportunidadApiMock.mockResolvedValue(oportunidadPlanaFake({ id: "opp-42" }));
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));
    await user.click(screen.getByRole("button", { name: "Crear oportunidad" }));

    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/oportunidades/opp-42"));
    expect(toast.success).toHaveBeenCalledWith("Oportunidad creada");
  });

  it("ante un 409 oportunidad_duplicada muestra el mensaje inline, no navega y el diálogo sigue abierto", async () => {
    crearOportunidadApiMock.mockRejectedValue(
      new ApiError(
        "oportunidad_duplicada",
        409,
        "Ya existe una oportunidad abierta para este lead y producto.",
      ),
    );
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));
    await user.click(screen.getByRole("button", { name: "Crear oportunidad" }));

    expect(
      await screen.findByText("Ya existe una oportunidad abierta para este lead y producto."),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Crear oportunidad" })).toBeInTheDocument();
  });
});
