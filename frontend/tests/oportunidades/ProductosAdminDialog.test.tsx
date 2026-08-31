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
vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({ useAuth: vi.fn() }));

const oportunidadesApi = await import("@/funcionalidades/oportunidades/oportunidades.api");
const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
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

/**
 * `ProductosAdminDialog` es controlado (tarea C1, refactor -- sin trigger
 * propio): `open`/`onOpenChange` los provee el caller
 * (`OportunidadesPage.tsx`/`NuevaOportunidadButton.tsx`). Estos tests
 * renderizan directamente con `open` en vez de simular el click de un botón
 * "Gestionar productos" que ya no vive acá.
 */
function renderDialog(
  empresaVistaId?: string,
  onOpenChange = vi.fn(),
  esVistaSoloLectura = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductosAdminDialog
        open
        onOpenChange={onOpenChange}
        empresaVistaId={empresaVistaId}
        esVistaSoloLectura={esVistaSoloLectura}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchProductosApiMock.mockResolvedValue([productoFake()]);
});

describe("ProductosAdminDialog", () => {
  it("no muestra nada para un rol distinto de ADMINISTRADOR (gate único, sin duplicar en el caller)", () => {
    mockearAuth("ASESOR");
    const { container } = renderDialog();
    expect(container).toBeEmptyDOMElement();
  });

  it("no muestra nada con esVistaSoloLectura, aunque el rol sea ADMINISTRADOR (holding-wide en «Ver en vivo»)", () => {
    mockearAuth("ADMINISTRADOR");
    const { container } = renderDialog(undefined, vi.fn(), true);
    expect(container).toBeEmptyDOMElement();
  });

  it("con open=true y rol ADMINISTRADOR, lista los productos", async () => {
    mockearAuth("ADMINISTRADOR");
    renderDialog("emp-1");

    expect(await screen.findByText("Departamento tipo A")).toBeInTheDocument();
    expect(fetchProductosApiMock).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: "emp-1" }),
    );
  });

  it("el formulario de creación rechaza un nombre vacío", async () => {
    mockearAuth("ADMINISTRADOR");
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole("button", { name: "Crear producto" }));

    expect(await screen.findByText("Ingresá el nombre.")).toBeInTheDocument();
    expect(crearProductoApiMock).not.toHaveBeenCalled();
  });

  it("el formulario de creación acepta un nombre válido", async () => {
    mockearAuth("ADMINISTRADOR");
    crearProductoApiMock.mockResolvedValue(productoFake({ id: "prod-2", nombre: "Departamento tipo B" }));
    const user = userEvent.setup();
    renderDialog("emp-1");

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

    await user.type(await screen.findByLabelText("Nombre del producto"), "Departamento tipo B");
    await user.click(screen.getByRole("button", { name: "Crear producto" }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Producto creado"));
  });

  it("«Cerrar» llama a onOpenChange(false)", async () => {
    mockearAuth("ADMINISTRADOR");
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(undefined, onOpenChange);

    // Dos elementos con nombre accesible "Cerrar": el botón del footer y la
    // X del propio `<Dialog>` (sr-only) -- el primero es el nuestro.
    const [botonCerrarFooter] = await screen.findAllByRole("button", { name: "Cerrar" });
    await user.click(botonCerrarFooter);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
