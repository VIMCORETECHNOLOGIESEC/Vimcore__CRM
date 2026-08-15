import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PageHeaderProvider,
  usePageHeader,
  usePageHeaderValue,
} from "@/layouts/PageHeaderContext";

/** Simula el consumidor real: `Header.tsx` leyendo el título publicado. */
function Lector() {
  const header = usePageHeaderValue();
  return <span>{header ? `${header.backTo ? `${header.backTo.label} > ` : ""}${header.title}` : "(vacío)"}</span>;
}

/** Simula una página publicando su título, condicionalmente según `config`. */
function Publicador({ config }: { config: { title: string; backTo?: { label: string; href: string } } | null }) {
  usePageHeader(config);
  return null;
}

function renderConProveedor(children: React.ReactNode) {
  return render(<PageHeaderProvider>{children}</PageHeaderProvider>);
}

describe("PageHeaderContext — publicar título", () => {
  it("un título publicado es visible a un lector dentro del mismo Provider", () => {
    renderConProveedor(
      <>
        <Publicador config={{ title: "Leads" }} />
        <Lector />
      </>,
    );

    expect(screen.getByText("Leads")).toBeInTheDocument();
  });

  it("incluye backTo solo si vienen label y href", () => {
    renderConProveedor(
      <>
        <Publicador config={{ title: "Roberto Salazar", backTo: { label: "Leads", href: "/leads" } }} />
        <Lector />
      </>,
    );

    expect(screen.getByText("Leads > Roberto Salazar")).toBeInTheDocument();
  });

  it("pasar null no publica un título parcial", () => {
    renderConProveedor(
      <>
        <Publicador config={null} />
        <Lector />
      </>,
    );

    expect(screen.getByText("(vacío)")).toBeInTheDocument();
  });

  it("al desmontar el publicador, el título se resetea a null", () => {
    const { rerender } = renderConProveedor(
      <>
        <Publicador config={{ title: "Leads" }} />
        <Lector />
      </>,
    );
    expect(screen.getByText("Leads")).toBeInTheDocument();

    rerender(
      <PageHeaderProvider>
        <Lector />
      </PageHeaderProvider>,
    );

    expect(screen.getByText("(vacío)")).toBeInTheDocument();
  });
});

describe("PageHeaderContext — uso sin Provider", () => {
  it("usePageHeaderValue no lanza y devuelve null sin <PageHeaderProvider>", () => {
    render(<Lector />);

    expect(screen.getByText("(vacío)")).toBeInTheDocument();
  });

  it("usePageHeader no lanza sin <PageHeaderProvider>", () => {
    expect(() => render(<Publicador config={{ title: "Leads" }} />)).not.toThrow();
  });
});
