import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/httpClient";
import type { OportunidadPlana, ProductoOportunidad } from "@/tipos/oportunidad";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/oportunidades/oportunidades.api", () => ({
  fetchProductosApi: vi.fn(),
  crearOportunidadApi: vi.fn(),
  crearProductoApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));

const navigateMock = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }));

const oportunidadesApi = await import("@/funcionalidades/oportunidades/oportunidades.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { NuevaOportunidadButton } = await import(
  "@/funcionalidades/oportunidades/NuevaOportunidadButton"
);

const fetchProductosApiMock = vi.mocked(oportunidadesApi.fetchProductosApi);
const crearOportunidadApiMock = vi.mocked(oportunidadesApi.crearOportunidadApi);
const useAuthMock = vi.mocked(useAuth);

function mockearAuth(rol: RolUsuario) {
  useAuthMock.mockReturnValue({
    user: { id: "u1", nombre: "Usuaria de prueba", correo: "u1@crm.test", rol },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) =>
      !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  } as unknown as ReturnType<typeof useAuth>);
}

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
  // Rol irrelevante en la mayoría de estos tests -- solo importa cuando el
  // catálogo de productos está vacío (ver describe dedicado más abajo).
  mockearAuth("ADMINISTRADOR");
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

/**
 * Sin productos en el catálogo: Administrador se redirige a "Gestionar
 * productos" en vez de ver el selector vacío (tarea C1). Un rol distinto de
 * Administrador conserva el selector con "Sin producto" como única opción --
 * el producto es opcional, así que igual puede crear la oportunidad.
 */
describe("NuevaOportunidadButton — sin productos en el catálogo", () => {
  it("Administrador ve un estado vacío con acción para ir a gestionar productos, sin el selector", async () => {
    fetchProductosApiMock.mockResolvedValue([]);
    mockearAuth("ADMINISTRADOR");
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));

    expect(await screen.findByText("Todavía no hay productos en el catálogo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a gestionar productos" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Producto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear oportunidad" })).not.toBeInTheDocument();
  });

  it("Administrador: al hacer clic en la acción, cierra este diálogo y abre el de gestión de productos", async () => {
    fetchProductosApiMock.mockResolvedValue([]);
    mockearAuth("ADMINISTRADOR");
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));
    await user.click(await screen.findByRole("button", { name: "Ir a gestionar productos" }));

    expect(screen.queryByRole("dialog", { name: "Nueva oportunidad" })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Catálogo de productos" })).toBeInTheDocument();
  });

  it("no Administrador (ej. Asesor) sigue viendo el selector con «Sin producto» como única opción", async () => {
    fetchProductosApiMock.mockResolvedValue([]);
    mockearAuth("ASESOR");
    const user = userEvent.setup();
    renderBoton();

    await user.click(screen.getByRole("button", { name: "Nueva oportunidad" }));

    expect(screen.getByRole("combobox", { name: "Producto" })).toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay productos en el catálogo")).not.toBeInTheDocument();
  });
});
