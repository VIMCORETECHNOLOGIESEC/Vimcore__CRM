import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UsuariosTable } from "@/funcionalidades/usuarios/UsuariosTable";
import type { AdminUsuario } from "@/tipos/usuario";

/**
 * Rol `ADMINISTRADOR` a propósito en todos los fixtures: la columna "Carga
 * activa de leads" solo dispara `useCargaActivaDeUsuario` (`useQuery`, ver
 * `UsuariosTable.tsx::CeldaCargaActiva`) para `ASESOR`/`VENDEDOR` -- con
 * `ADMINISTRADOR` renderiza "No aplica" sin tocar la red, así esta suite no
 * necesita mockear `usuarios.api.ts` ni envolver en `QueryClientProvider`.
 */
function usuarioFake(overrides: Partial<AdminUsuario> = {}): AdminUsuario {
  return {
    id: "u1",
    nombre: "Marta Herrera",
    correo: "marta@crm.test",
    rol: "ADMINISTRADOR",
    activo: true,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function renderTabla(usuarios: AdminUsuario[], mostrarEmpresas?: boolean, soloLectura?: boolean) {
  return render(
    <TooltipProvider>
      <UsuariosTable
        usuarios={usuarios}
        onEditar={vi.fn()}
        onRestablecerPassword={vi.fn()}
        onDarDeBaja={vi.fn()}
        onReactivar={vi.fn()}
        reactivandoId={null}
        atenuarInactivos={false}
        mostrarEmpresas={mostrarEmpresas}
        soloLectura={soloLectura}
      />
    </TooltipProvider>,
  );
}

describe("UsuariosTable -- subtítulo de empresa por fila", () => {
  it("no muestra ningún subtítulo bajo el nombre cuando mostrarEmpresas no está activo (default)", () => {
    renderTabla([usuarioFake({ empresas: [] })]);

    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
    expect(screen.queryByText("Holding")).not.toBeInTheDocument();
  });

  it("no muestra el subtítulo cuando mostrarEmpresas={false} explícito, aunque el usuario tenga empresas", () => {
    renderTabla(
      [usuarioFake({ empresas: [{ id: "e1", nombre: "Empresa A" }] })],
      false,
    );

    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
    expect(screen.queryByText("Empresa A")).not.toBeInTheDocument();
  });

  it("muestra 'Holding' cuando mostrarEmpresas está activo y el usuario no tiene ninguna empresa", () => {
    renderTabla([usuarioFake({ empresas: [] })], true);

    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
    expect(screen.getByText("Holding")).toBeInTheDocument();
  });

  it("muestra el nombre de la empresa cuando mostrarEmpresas está activo y el usuario tiene una", () => {
    renderTabla(
      [usuarioFake({ empresas: [{ id: "e1", nombre: "Empresa A" }] })],
      true,
    );

    expect(screen.getByText("Empresa A")).toBeInTheDocument();
    expect(screen.queryByText("Holding")).not.toBeInTheDocument();
  });

  it("une los nombres de varias empresas con coma cuando el usuario tiene más de una", () => {
    renderTabla(
      [
        usuarioFake({
          empresas: [
            { id: "e1", nombre: "Empresa A" },
            { id: "e2", nombre: "Empresa B" },
          ],
        }),
      ],
      true,
    );

    expect(screen.getByText("Empresa A, Empresa B")).toBeInTheDocument();
  });

  it("trata `empresas` ausente (fixture sin ese campo) como si fuera []", () => {
    const { empresas: _empresas, ...usuarioSinEmpresas } = usuarioFake();
    renderTabla([usuarioSinEmpresas as AdminUsuario], true);

    expect(screen.getByText("Holding")).toBeInTheDocument();
  });
});

describe("UsuariosTable -- presencia online/offline", () => {
  it("muestra el estado de conexión de un usuario", () => {
    renderTabla([
      usuarioFake({
        presencia: {
          estado: "online",
          conectadoDesde: new Date(Date.now() - 60_000).toISOString(),
          ultimaSenalEn: new Date().toISOString(),
          desconectadoEn: null,
          conexionesActivas: 1,
        },
      }),
    ]);

    expect(screen.getByText("Conexión")).toBeInTheDocument();
    expect(screen.getByText("En línea")).toBeInTheDocument();
  });

  it("muestra desconectado sin registro cuando no hay presencia en memoria", () => {
    renderTabla([usuarioFake()]);

    expect(screen.getByText("Desconectado")).toBeInTheDocument();
    expect(screen.getByText("Sin registro")).toBeInTheDocument();
  });
});

describe("UsuariosTable -- soloLectura (holding-wide en 'Ver en vivo' de una empresa, bug corregido)", () => {
  it("con soloLectura, oculta la columna Acciones por completo (sin header ni botón de menú por fila)", () => {
    renderTabla([usuarioFake()], false, true);

    expect(screen.getByText("Marta Herrera")).toBeInTheDocument();
    expect(screen.queryByText("Acciones")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Acciones de Marta Herrera" }),
    ).not.toBeInTheDocument();
  });

  it("sin soloLectura (default), muestra la columna Acciones con normalidad", () => {
    renderTabla([usuarioFake()]);

    expect(screen.getByText("Acciones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acciones de Marta Herrera" })).toBeInTheDocument();
  });
});
