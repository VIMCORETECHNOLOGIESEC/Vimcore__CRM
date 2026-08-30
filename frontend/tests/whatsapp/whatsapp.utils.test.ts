import { afterEach, describe, expect, it, vi } from "vitest";
import {
  guardarEmpresaFlujo,
  leerYLimpiarEmpresaFlujo,
  redirectTo,
} from "@/funcionalidades/whatsapp/whatsapp.utils";

/**
 * `whatsapp.utils.ts`: persistencia de `empresaId` entre el Paso 1
 * (`GET /whatsapp/conectar`) y el Paso 2/3 -- se pierde en memoria porque
 * Meta hace una navegación completa del navegador de por medio (contrato,
 * sección 1-3). También cubre `redirectTo`, la única función que dispara la
 * navegación real de Paso 1.
 */
describe("whatsapp.utils — persistencia de empresaId entre Paso 1 y Paso 2/3", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("guarda y devuelve el empresaId guardado, y lo limpia después de leerlo (un solo uso)", () => {
    guardarEmpresaFlujo("empresa-1");
    expect(leerYLimpiarEmpresaFlujo()).toBe("empresa-1");
    expect(leerYLimpiarEmpresaFlujo()).toBeUndefined();
  });

  it("con empresaId undefined (actor sesión company), no guarda nada", () => {
    expect(() => guardarEmpresaFlujo(undefined)).not.toThrow();
    expect(leerYLimpiarEmpresaFlujo()).toBeUndefined();
  });

  it("guardar undefined limpia cualquier empresaId guardado antes", () => {
    guardarEmpresaFlujo("empresa-1");
    guardarEmpresaFlujo(undefined);
    expect(leerYLimpiarEmpresaFlujo()).toBeUndefined();
  });

  it("degrada en silencio si sessionStorage no está disponible (modo privado estricto)", () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: () => {
          throw new Error("no disponible");
        },
        setItem: () => {
          throw new Error("no disponible");
        },
        removeItem: () => {
          throw new Error("no disponible");
        },
      },
      configurable: true,
    });

    expect(() => guardarEmpresaFlujo("empresa-1")).not.toThrow();
    expect(leerYLimpiarEmpresaFlujo()).toBeUndefined();

    Object.defineProperty(window, "sessionStorage", { value: original, configurable: true });
  });
});

describe("whatsapp.utils — redirectTo", () => {
  it("redirige el navegador de verdad a la authorizationUrl de Meta", () => {
    // jsdom no permite redefinir `Location.prototype.assign` con `vi.spyOn`
    // (propiedad no configurable en esta versión) -- se reemplaza el objeto
    // `window.location` completo en vez de espiar su prototipo, único
    // camino compatible con jsdom para interceptar la navegación real.
    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign: assignMock },
      configurable: true,
      writable: true,
    });

    redirectTo("https://meta.example/oauth?x=1");

    expect(assignMock).toHaveBeenCalledWith("https://meta.example/oauth?x=1");

    Object.defineProperty(window, "location", {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });
});
