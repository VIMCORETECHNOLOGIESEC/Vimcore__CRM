import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/funcionalidades/autenticacion/auth-context", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/funcionalidades/autenticacion/auth-context");
const { useTutorialEntryModal, marcarTutorialFinalizadoEnSesion } = await import(
  "@/funcionalidades/leads/tutorial/useTutorialEntryModal"
);

const useAuthMock = vi.mocked(useAuth);

function mockearUsuario(id: string | null) {
  useAuthMock.mockReturnValue({
    user: id ? { id, nombre: "Usuaria", correo: "u@crm.test", rol: "ASESOR" } : null,
    isAuthenticated: Boolean(id),
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    hasRole: () => true,
  } as unknown as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTutorialEntryModal", () => {
  it("mostrarModal es true cuando hay usuario autenticado y no existe el flag de descarte", () => {
    mockearUsuario("usuario-1");

    const { result } = renderHook(() => useTutorialEntryModal());

    expect(result.current.mostrarModal).toBe(true);
  });

  it("mostrarModal es false si no hay usuario autenticado", () => {
    mockearUsuario(null);

    const { result } = renderHook(() => useTutorialEntryModal());

    expect(result.current.mostrarModal).toBe(false);
  });

  it("mostrarModal es false si el flag ya está seteado en localStorage para ese userId", () => {
    localStorage.setItem("crm.leads-navigation-tour.modal-dismissed.usuario-1", "true");
    mockearUsuario("usuario-1");

    const { result } = renderHook(() => useTutorialEntryModal());

    expect(result.current.mostrarModal).toBe(false);
  });

  it("marcarNoMostrar() persiste el flag en localStorage y oculta el modal de inmediato", () => {
    mockearUsuario("usuario-1");
    const { result } = renderHook(() => useTutorialEntryModal());
    expect(result.current.mostrarModal).toBe(true);

    act(() => {
      result.current.marcarNoMostrar();
    });

    expect(result.current.mostrarModal).toBe(false);
    expect(localStorage.getItem("crm.leads-navigation-tour.modal-dismissed.usuario-1")).toBe(
      "true",
    );
  });

  it("cerrar() oculta el modal SIN persistir nada en localStorage", () => {
    mockearUsuario("usuario-1");
    const { result } = renderHook(() => useTutorialEntryModal());
    expect(result.current.mostrarModal).toBe(true);

    act(() => {
      result.current.cerrar();
    });

    expect(result.current.mostrarModal).toBe(false);
    expect(localStorage.getItem("crm.leads-navigation-tour.modal-dismissed.usuario-1")).toBeNull();
  });

  it("el flag de este modal es independiente del flag legado 'completed' del tutorial", () => {
    localStorage.setItem("crm.leads-navigation-tour.completed.usuario-1", "true");
    mockearUsuario("usuario-1");

    const { result } = renderHook(() => useTutorialEntryModal());

    expect(result.current.mostrarModal).toBe(true);
  });

  /**
   * Bug real reportado: terminar o saltar el tour navega de vuelta a /leads
   * (`finishTour()`), lo que desmonta y remonta `LeadsPage` -- sin este
   * flag de sesión, el modal reaparecía en el acto, dentro de la misma
   * sesión, porque el flag PERMANENTE ("no volver a mostrar") nunca se
   * tildó. `marcarTutorialFinalizadoEnSesion()` es lo que llama
   * `finishTour()` en `LeadsNavigationTutorial.tsx`.
   */
  it("tras marcarTutorialFinalizadoEnSesion(), un remount de la página (nuevo hook) no vuelve a mostrar el modal en la misma sesión", () => {
    mockearUsuario("usuario-1");
    const primerMontaje = renderHook(() => useTutorialEntryModal());
    expect(primerMontaje.result.current.mostrarModal).toBe(true);

    act(() => {
      marcarTutorialFinalizadoEnSesion();
    });

    // Simula el remount real de `LeadsPage` al volver a /leads: un hook
    // nuevo, no el mismo estado en memoria del primer montaje.
    const segundoMontaje = renderHook(() => useTutorialEntryModal());
    expect(segundoMontaje.result.current.mostrarModal).toBe(false);

    // El flag PERMANENTE nunca se tildó -- "no volver a mostrar" sigue sin marcarse.
    expect(localStorage.getItem("crm.leads-navigation-tour.modal-dismissed.usuario-1")).toBeNull();
  });

  it("una sesión nueva (sessionStorage limpio) sí vuelve a mostrar el modal aunque no se haya tildado 'no volver a mostrar'", () => {
    mockearUsuario("usuario-1");
    act(() => {
      marcarTutorialFinalizadoEnSesion();
    });

    // Cierre de sesión del navegador simulado: sessionStorage se limpia solo.
    sessionStorage.clear();

    const { result } = renderHook(() => useTutorialEntryModal());
    expect(result.current.mostrarModal).toBe(true);
  });
});
