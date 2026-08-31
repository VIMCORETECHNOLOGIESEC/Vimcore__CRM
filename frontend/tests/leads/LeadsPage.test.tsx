import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Lead } from "@/tipos/lead";
import type { RolUsuario } from "@/tipos/usuario";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

/**
 * `LeadsFiltros` (F3) consume `useRedesSocialesCatalogo()`
 * (`GET /leads/catalogo/redes-sociales`) -- se mockea acá junto con
 * `fetchLeadsApi` para que estas pruebas sigan siendo deterministas y no
 * dependan de datos reales. El comportamiento del filtro en sí (visibilidad
 * por rol, cascada con los demás filtros) tiene su propio test dedicado en
 * `tests/leads/LeadsFiltros.test.tsx`.
 */
vi.mock("@/funcionalidades/leads/leads.api", () => ({
  fetchLeadsApi: vi.fn(),
  assignLeadsMasivoApi: vi.fn(),
  fetchRedesSocialesCatalogoApi: vi.fn(),
  getCatalogoCampanias: vi.fn(() => [{ id: "camp-1", nombre: "Verano 2026" }]),
  // `getCatalogoResponsables` es backend real (D-A2) -- async en la app real,
  // pero `useQuery` acepta igual un `queryFn` síncrono en tests.
  getCatalogoResponsables: vi.fn(() =>
    Promise.resolve([
      { id: "asesor-1", nombre: "Marta Herrera" },
      { id: "vendedor-1", nombre: "Sofía Vintimilla" },
    ]),
  ),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { fetchLeadsApi, assignLeadsMasivoApi, fetchRedesSocialesCatalogoApi } = await import(
  "@/funcionalidades/leads/leads.api"
);
const { LeadsPage } = await import("@/funcionalidades/leads/LeadsPage");

const useAuthMock = vi.mocked(useAuth);
const fetchLeadsApiMock = vi.mocked(fetchLeadsApi);
const assignLeadsMasivoApiMock = vi.mocked(assignLeadsMasivoApi);
const fetchRedesSocialesCatalogoApiMock = vi.mocked(fetchRedesSocialesCatalogoApi);

/**
 * `sessionScope`/`empresaId` opcionales (default `undefined`) a propósito:
 * el resto de los tests de este archivo (heredados, previos al canal manual)
 * siguen ejerciendo el caso "sin scope de sesión" -- `esSesionEmpresa` de
 * `LeadsPage.tsx` da `false` y ninguno de los dos botones del canal manual
 * se muestra, que es el comportamiento correcto para no romper esos tests.
 */
function mockearAuth(
  rol: RolUsuario,
  opciones: { sessionScope?: "company" | "holding"; empresaId?: string | null } = {},
) {
  useAuthMock.mockReturnValue({
    user: {
      id: "u1",
      nombre: "Usuaria de prueba",
      correo: "u1@crm.test",
      rol,
      sessionScope: opciones.sessionScope,
      empresaId: opciones.empresaId,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: (allowedRoles) => !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(rol),
  } as unknown as ReturnType<typeof useAuth>);
}

function leadFake(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-01",
    cliente: {
      id: "cliente-01",
      nombre: "Roberto Salazar",
      telefonoOriginal: "0991234567",
      telefonoNormalizado: "+593991234567",
      correoPrincipal: "roberto.salazar@mail.com",
    },
    campania: { id: "camp-1", nombre: "Verano 2026" },
    origen: "REINGRESO",
    redSocial: "INSTAGRAM",
    etapa: "CONTACTADO",
    semaforo: "ROJO",
    puntuacion: 32,
    asesor: { id: "asesor-1", nombre: "Marta Herrera", rol: "ASESOR" },
    vendedor: null,
    slaInicioEn: new Date().toISOString(),
    ingresadoEn: new Date().toISOString(),
    cerradoEn: null,
    ...overrides,
  };
}

function renderLeadsPage(rutaInicial = "/leads") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {/* MemoryRouter: LeadsTable enlaza el nombre del cliente a /leads/:id (F4). */}
        <MemoryRouter initialEntries={[rutaInicial]}>
          <LeadsPage />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchLeadsApiMock.mockReset();
  assignLeadsMasivoApiMock.mockReset();
  assignLeadsMasivoApiMock.mockResolvedValue(undefined);
  fetchRedesSocialesCatalogoApiMock.mockReset();
  fetchRedesSocialesCatalogoApiMock.mockResolvedValue(["FACEBOOK", "INSTAGRAM", "X", "LINKEDIN", "GOOGLE_FORMS"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadsPage — estados de carga, vacío y error", () => {
  it("muestra un esqueleto de carga mientras llega la respuesta", async () => {
    mockearAuth("ADMINISTRADOR");
    let resolver: (value: Awaited<ReturnType<typeof fetchLeadsApi>>) => void = () => {};
    fetchLeadsApiMock.mockReturnValue(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    renderLeadsPage();

    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();

    resolver({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument(),
    );
  });

  it("muestra un estado vacío honesto cuando no hay leads que coincidan", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [], total: 0, pagina: 1, porPagina: 10 });

    renderLeadsPage();

    expect(
      await screen.findByText("No hay leads que coincidan con estos filtros"),
    ).toBeInTheDocument();
  });

  it("muestra un mensaje de error accionable (nunca un código HTTP) con botón de reintentar", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockRejectedValue(new Error("boom"));

    renderLeadsPage();

    expect(await screen.findByText("Ocurrió un error inesperado. Intentá nuevamente en unos segundos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

describe("LeadsPage — tabla y vista por rol", () => {
  it("para administrador: muestra columna de responsable y casillas de selección masiva", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });

    renderLeadsPage();

    expect(await screen.findByText("Roberto Salazar")).toBeInTheDocument();
    expect(screen.getByText("Reingreso")).toBeInTheDocument();
    expect(screen.getByText("Lead frío")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Responsable" })).toBeInTheDocument();
    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar a Roberto Salazar" }),
    ).toBeInTheDocument();
  });

  it("para asesor: oculta la columna de responsable y no ofrece selección masiva", async () => {
    mockearAuth("ASESOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });

    renderLeadsPage();

    expect(await screen.findByText("Roberto Salazar")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Responsable" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Seleccionar a Roberto Salazar" }),
    ).not.toBeInTheDocument();
  });
});

describe("LeadsPage — filtros combinables y búsqueda", () => {
  it("la búsqueda por nombre/teléfono/correo dispara una nueva consulta con el término", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.type(screen.getByLabelText("Buscar leads"), "roberto");

    await waitFor(() => {
      const ultimaLlamada = fetchLeadsApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.busqueda).toBe("roberto");
    });
  });

  it("con ?empresaId= en la URL (vista viva de un holding-wide, useVistaEmpresa), reenvía empresaId en la consulta", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "holding", empresaId: null });
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });

    renderLeadsPage("/leads?empresaId=empresa-9");
    await screen.findByText("Roberto Salazar");

    await waitFor(() => {
      const ultimaLlamada = fetchLeadsApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.empresaId).toBe("empresa-9");
    });
  });

  it("cambiar la etapa filtrada reinicia la paginación a la página 1", async () => {
    mockearAuth("ADMINISTRADOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("button", { name: /Filtros/ }));
    await user.click(screen.getByRole("combobox", { name: "Etapa" }));
    await user.click(await screen.findByRole("option", { name: "Venta" }));

    await waitFor(() => {
      const ultimaLlamada = fetchLeadsApiMock.mock.calls.at(-1)?.[0];
      expect(ultimaLlamada?.etapa).toBe("VENTA");
      expect(ultimaLlamada?.pagina).toBe(1);
    });
  });
});

describe("LeadsPage — asignación masiva (supervisor/administrador)", () => {
  it("selecciona leads, elige responsable y dispara la asignación masiva", async () => {
    mockearAuth("SUPERVISOR");
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("checkbox", { name: "Seleccionar a Roberto Salazar" }));
    expect(screen.getByText("1 lead seleccionado")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Nuevo responsable" }));
    await user.click(await screen.findByRole("option", { name: "Sofía Vintimilla" }));
    await user.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => {
      expect(assignLeadsMasivoApiMock).toHaveBeenCalledWith(["lead-01"], "vendedor-1");
    });
  });

  it("holding-wide en «Ver en vivo» (?empresaId= con sessionScope holding): no ofrece selección ni «Asignar»", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "holding", empresaId: null });
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });

    renderLeadsPage("/leads?empresaId=empresa-9");
    await screen.findByText("Roberto Salazar");

    expect(
      screen.queryByRole("checkbox", { name: "Seleccionar a Roberto Salazar" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Asignar" })).not.toBeInTheDocument();
    // La columna de responsable sigue siendo de solo lectura: no se oculta.
    expect(screen.getByRole("columnheader", { name: "Responsable" })).toBeInTheDocument();
  });
});

/**
 * Canal de ingreso manual (diferido, docs/blocks/d-routing-oportunidad.md:
 * 272-353) -- exclusivo de sesión `company`, nunca `holding` (cada empresa
 * carga sus propios leads). `puedeCargarLeadManual` cubre Administrador/
 * Supervisor/Asesor; `puedeGestionarCanales` acota a Administrador. Ambos
 * requieren además `empresaId !== null`.
 */
describe("LeadsPage — canal de ingreso manual (botones por rol/scope)", () => {
  beforeEach(() => {
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
  });

  it("Administrador de sesión company ve ambos botones", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "company", empresaId: "empresa-1" });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.getByRole("button", { name: "Cargar lead manual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar canales" })).toBeInTheDocument();
  });

  it("Supervisor de sesión company ve «Cargar lead manual» pero no «Gestionar canales»", async () => {
    mockearAuth("SUPERVISOR", { sessionScope: "company", empresaId: "empresa-1" });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.getByRole("button", { name: "Cargar lead manual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar canales" })).not.toBeInTheDocument();
  });

  it("Asesor de sesión company ve «Cargar lead manual» pero no «Gestionar canales»", async () => {
    mockearAuth("ASESOR", { sessionScope: "company", empresaId: "empresa-1" });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.getByRole("button", { name: "Cargar lead manual" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar canales" })).not.toBeInTheDocument();
  });

  it("Vendedor de sesión company no ve ninguno de los dos botones", async () => {
    mockearAuth("VENDEDOR", { sessionScope: "company", empresaId: "empresa-1" });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.queryByRole("button", { name: "Cargar lead manual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar canales" })).not.toBeInTheDocument();
  });

  it("Administrador de sesión holding no ve ninguno de los dos botones (nunca holding-wide)", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "holding", empresaId: null });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.queryByRole("button", { name: "Cargar lead manual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar canales" })).not.toBeInTheDocument();
  });

  it("SUPERVISOR_HOLDING de sesión holding no ve ninguno de los dos botones", async () => {
    mockearAuth("SUPERVISOR_HOLDING", { sessionScope: "holding", empresaId: null });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.queryByRole("button", { name: "Cargar lead manual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar canales" })).not.toBeInTheDocument();
  });

  it("Administrador de sesión company con empresaId null (caso defensivo): los botones se muestran, pero abrirlos no despliega ningún diálogo", async () => {
    // Caso límite -- en la práctica una sesión `company` siempre trae
    // `empresaId` (ver `AuthenticatedUser`, docs D0), pero el tipo lo declara
    // nullable. `puedeCargarLeadManual`/`puedeGestionarCanales` en
    // `LeadsPage.tsx` solo dependen de `esSesionEmpresa` + rol, NO de
    // `empresaId !== null` -- ese chequeo extra vive únicamente en el
    // renderizado condicional de cada diálogo (`{dialogXAbierto && empresaId
    // ? ... : null}`), a pesar de que el comentario del componente dice "ambos
    // gateados también por empresaId !== null" (no es 100% preciso: los
    // BOTONES no están gateados por empresaId, solo los diálogos). Se
    // documenta acá el comportamiento real en vez de forzar el que describe
    // el comentario.
    mockearAuth("ADMINISTRADOR", { sessionScope: "company", empresaId: null });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.getByRole("button", { name: "Cargar lead manual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar canales" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cargar lead manual" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Gestionar canales" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin sessionScope definido (tests heredados de esta suite) no ve ninguno de los dos botones", async () => {
    mockearAuth("ADMINISTRADOR");

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.queryByRole("button", { name: "Cargar lead manual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar canales" })).not.toBeInTheDocument();
  });

  it("«Cargar lead manual» abre el diálogo de alta manual", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "company", empresaId: "empresa-1" });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("button", { name: "Cargar lead manual" }));

    expect(await screen.findByRole("dialog", { name: "Cargar lead manual" })).toBeInTheDocument();
  });

  it("«Gestionar canales» abre el diálogo de administración del catálogo", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "company", empresaId: "empresa-1" });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("button", { name: "Gestionar canales" }));

    expect(await screen.findByRole("dialog", { name: "Canales de ingreso manual" })).toBeInTheDocument();
  });

  /**
   * Sin canales activos, Administrador se redirige a "Gestionar canales" en
   * vez de ver el formulario vacío (tarea C1) -- coordinación de estado entre
   * ambos diálogos en `LeadsPage.tsx`: cierra "Cargar lead manual" y abre
   * "Gestionar canales" en el mismo `onClick`.
   */
  it("Administrador sin canales activos: «Ir a gestionar canales» cierra el diálogo de alta y abre el de canales", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "company", empresaId: "empresa-1" });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("button", { name: "Cargar lead manual" }));
    expect(await screen.findByRole("dialog", { name: "Cargar lead manual" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir a gestionar canales" }));

    expect(screen.queryByRole("dialog", { name: "Cargar lead manual" })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: "Canales de ingreso manual" })).toBeInTheDocument();
  });
});

/**
 * "Carga masiva (Excel)" (diferido, `CargaMasivaLeadsDialog.tsx`) reusa
 * EXACTAMENTE el guard de "Cargar lead manual" (`puedeCargarLeadManual`):
 * misma capacidad, solo que en lote. No repite todos los casos de rol/scope
 * ya cubiertos arriba para "Cargar lead manual" -- alcanza con verificar que
 * el botón aparece/desaparece junto con "Cargar lead manual" en un caso
 * habilitado y uno deshabilitado, y que abre el diálogo correcto.
 */
describe("LeadsPage — carga masiva (Excel), mismo guard que «Cargar lead manual»", () => {
  beforeEach(() => {
    fetchLeadsApiMock.mockResolvedValue({ datos: [leadFake()], total: 1, pagina: 1, porPagina: 10 });
  });

  it("Asesor de sesión company ve «Carga masiva (Excel)» junto con «Cargar lead manual»", async () => {
    mockearAuth("ASESOR", { sessionScope: "company", empresaId: "empresa-1" });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.getByRole("button", { name: "Cargar lead manual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carga masiva (Excel)" })).toBeInTheDocument();
  });

  it("Vendedor de sesión company no ve «Carga masiva (Excel)»", async () => {
    mockearAuth("VENDEDOR", { sessionScope: "company", empresaId: "empresa-1" });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.queryByRole("button", { name: "Carga masiva (Excel)" })).not.toBeInTheDocument();
  });

  it("Administrador de sesión holding no ve «Carga masiva (Excel)» (nunca holding-wide)", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "holding", empresaId: null });

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    expect(screen.queryByRole("button", { name: "Carga masiva (Excel)" })).not.toBeInTheDocument();
  });

  it("«Carga masiva (Excel)» abre el diálogo de carga masiva", async () => {
    mockearAuth("ADMINISTRADOR", { sessionScope: "company", empresaId: "empresa-1" });
    const user = userEvent.setup();

    renderLeadsPage();
    await screen.findByText("Roberto Salazar");

    await user.click(screen.getByRole("button", { name: "Carga masiva (Excel)" }));

    expect(await screen.findByRole("dialog", { name: "Carga masiva de leads" })).toBeInTheDocument();
  });
});
