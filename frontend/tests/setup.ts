import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Desmonta cada árbol de React renderizado entre tests -- sin esto, los
// componentes se acumulan en el DOM de jsdom entre casos y `screen.getBy*`
// puede matchear un nodo de un test anterior.
afterEach(() => {
  cleanup();
});

// jsdom no implementa la Pointer Events API (`hasPointerCapture`,
// `setPointerCapture`, `releasePointerCapture`) ni `scrollIntoView` -- Radix
// `Select` (F3, `components/ui/select.tsx`) los usa al abrir/cerrar con
// clic, y sin este polyfill `userEvent.click` lanza `TypeError` en jsdom.
// Limitación conocida y documentada de jsdom + Radix, no un bug de la app.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
