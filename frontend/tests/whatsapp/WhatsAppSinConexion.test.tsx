import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

/**
 * `WhatsAppSinConexion.tsx` -- estado del panel de WhatsApp del detalle de
 * un lead cuando la EMPRESA no tiene una `WhatsAppConexion` activa
 * (`WhatsAppChat` en `LeadDetallePage.tsx`, `estado !== "ACTIVA"`). Mockea
 * `NotificarWhatsAppNoConectadoDialog` para aislar el comportamiento propio
 * de este componente: a quién manda el botón según el rol.
 */
vi.mock("@/funcionalidades/whatsapp/NotificarWhatsAppNoConectadoDialog", () => ({
  NotificarWhatsAppNoConectadoDialog: ({ open }: { open: boolean }) => (
    <div>NotificarWhatsAppNoConectadoDialog mock — open:{String(open)}</div>
  ),
}));

const { WhatsAppSinConexion } = await import("@/funcionalidades/whatsapp/WhatsAppSinConexion");

function renderComponent(
  props: Partial<ComponentProps<typeof WhatsAppSinConexion>> = {},
  rutaInicial = "/leads/lead-01",
) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Routes>
        <Route
          path="/leads/lead-01"
          element={<WhatsAppSinConexion puedeIrABridges={false} {...props} />}
        />
        <Route path="/bridges" element={<span>Marcador: Bridges (global)</span>} />
        <Route
          path="/empresas/:empresaId/bridges"
          element={<span>Marcador: Bridges de la empresa</span>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WhatsAppSinConexion", () => {
  it("muestra el ícono de WhatsApp y el mensaje de no conexión siempre", () => {
    renderComponent();

    expect(screen.getByText("No hay conexión con WhatsApp.")).toBeInTheDocument();
  });

  it("rol con acceso a Bridges (Administrador): muestra «Ir a Bridges» y navega a /bridges sin empresaVistaId", async () => {
    const user = userEvent.setup();
    renderComponent({ puedeIrABridges: true, empresaVistaId: null });

    expect(screen.queryByText("Notificar a administrador")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ir a Bridges" }));

    expect(await screen.findByText("Marcador: Bridges (global)")).toBeInTheDocument();
  });

  it("holding-wide con empresaVistaId: «Ir a Bridges» navega a /empresas/:empresaId/bridges", async () => {
    const user = userEvent.setup();
    renderComponent({ puedeIrABridges: true, empresaVistaId: "empresa-9" });

    await user.click(screen.getByRole("button", { name: "Ir a Bridges" }));

    expect(await screen.findByText("Marcador: Bridges de la empresa")).toBeInTheDocument();
  });

  it("rol sin acceso a Bridges (Supervisor/Asesor): muestra «Notificar a administrador» y abre el diálogo", async () => {
    const user = userEvent.setup();
    renderComponent({ puedeIrABridges: false });

    expect(screen.queryByText("Ir a Bridges")).not.toBeInTheDocument();
    expect(
      screen.getByText("NotificarWhatsAppNoConectadoDialog mock — open:false"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notificar a administrador" }));

    expect(
      await screen.findByText("NotificarWhatsAppNoConectadoDialog mock — open:true"),
    ).toBeInTheDocument();
  });
});
