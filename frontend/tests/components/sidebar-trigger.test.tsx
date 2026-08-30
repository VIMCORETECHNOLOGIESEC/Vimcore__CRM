import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Bug real: `SidebarTrigger` usaba `<Button variant="ghost">`, que trae
 * `hover:bg-accent hover:text-accent-foreground` (tokens GENÉRICOS del tema,
 * `--accent`, nunca tocados por el color de marca de empresa). El resto de
 * los ítems del sidebar ya usa `hover:bg-sidebar-accent
 * hover:text-sidebar-accent-foreground` (SÍ brand-aware). Este test verifica
 * que el botón de colapsar/expandir el sidebar quede consistente con esos
 * ítems -- sin el fix, `className` seguiría conteniendo `hover:bg-accent`.
 */
describe("SidebarTrigger -- hover consistente con el resto del sidebar (brand-aware)", () => {
  it("usa hover:bg-sidebar-accent/hover:text-sidebar-accent-foreground en vez del hover genérico del variant ghost", () => {
    render(
      <SidebarProvider>
        <SidebarTrigger data-testid="sidebar-trigger" />
      </SidebarProvider>,
    );

    const trigger = screen.getByTestId("sidebar-trigger");

    expect(trigger.className).toContain("hover:bg-sidebar-accent");
    expect(trigger.className).toContain("hover:text-sidebar-accent-foreground");
    expect(trigger.className).not.toContain("hover:bg-accent");
    expect(trigger.className).not.toContain("hover:text-accent-foreground");
  });
});
