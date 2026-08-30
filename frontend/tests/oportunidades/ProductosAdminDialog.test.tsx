import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductoOportunidad } from "@/tipos/oportunidad";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/oportunidades/oportunidades.api", () => ({
  fetchProductosApi: vi.fn(),
  crearProductoApi: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/funcionalidades/autenticacion/authContext", () => ({ useAuth: vi.fn() }));

const oportunidadesApi = await import("@/funcionalidades/oportunidades/oportunidades.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/authContext");
const { ProductosAdminDialog } = await import(
  "@/funcionalidades/oportunidades/ProductosAdminDialog"
);

const fetchProductosApiMock = vi.mocked(oportunidadesApi.fetchProductosApi);
const crearProductoApiMock = vi.mocked(oportunidadesApi.crearProductoApi);
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

function renderDialog(empresaVistaId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductosAdminDialog empresaVistaId={empresaVistaId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchProductosApiMock.mockResolvedValue([productoFake()]);
});

describe("ProductosAdminDialog", () => {
  it("no muestra el trigger para un rol distinto de ADMINISTRADOR", () => {
    mockearAuth("ASESOR");
    const { container } = renderDialog();
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra el trigger 'Gestionar productos' para ADMINISTRADOR", () => {
    mockearAuth("ADMINISTRADOR");
    renderDialog();
    expect(screen.getByRole("button", { name: "Gestionar productos" })).toBeInTheDocument();
  });

  it("abrir el diálogo lista los productos", async () => {
    mockearAuth("ADMINISTRADOR");
    const user = userEvent.setup();
    renderDialog("emp-1");

    await user.click(screen.getByRole("button", { name: "Gestionar productos" }));

    expect(await screen.findByText("Departamento tipo A")).toBeInTheDocument();
    expect(fetchProductosApiMock).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: "emp-1" }),
    );
  });

  it("el formulario de creación rechaza un nombre vacío", async () => {
    mockearAuth("ADMINISTRADOR");
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Gestionar productos" }));
    await user.click(await screen.findByRole("button", { name: "Crear producto" }));

    expect(await screen.findByText("Ingresá el nombre.")).toBeInTheDocument();
    expect(crearProductoApiMock).not.toHaveBeenCalled();
  });

  it("el formulario de creación acepta un nombre válido", async () => {
    mockearAuth("ADMINISTRADOR");
    crearProductoApiMock.mockResolvedValue(productoFake({ id: "prod-2", nombre: "Departamento tipo B" }));
    const user = userEvent.setup();
    renderDialog("emp-1");

    await user.click(screen.getByRole("button", { name: "Gestionar productos" }));
    await user.type(await screen.findByLabelText("Nombre del producto"), "Departamento tipo B");
    await user.click(screen.getByRole("button", { name: "Crear producto" }));

    expect(crearProductoApiMock.mock.calls[0]?.[0]).toEqual({
      nombre: "Departamento tipo B",
      empresaId: "emp-1",
    });
  });

  it("crear un producto invalida el catálogo y muestra un toast de éxito", async () => {
    mockearAuth("ADMINISTRADOR");
    crearProductoApiMock.mockResolvedValue(productoFake({ id: "prod-2", nombre: "Departamento tipo B" }));
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Gestionar productos" }));
    await user.type(await screen.findByLabelText("Nombre del producto"), "Departamento tipo B");
    await user.click(screen.getByRole("button", { name: "Crear producto" }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Producto creado"));
  });
});
