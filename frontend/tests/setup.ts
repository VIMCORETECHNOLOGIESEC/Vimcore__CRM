import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Desmonta cada árbol de React renderizado entre tests -- sin esto, los
// componentes se acumulan en el DOM de jsdom entre casos y `screen.getBy*`
// puede matchear un nodo de un test anterior.
afterEach(() => {
  cleanup();
});
