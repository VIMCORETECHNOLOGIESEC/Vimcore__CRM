import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

/**
 * Config de pruebas unitarias (AGENTS.md §5, bloqueante F1 resuelto).
 * Reutiliza `vite.config.ts` (alias `@/*`, plugin de React) vía
 * `mergeConfig`, en vez de duplicarlo, para que el entorno de test resuelva
 * imports exactamente igual que el build de la app.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./tests/setup.ts"],
      include: ["tests/**/*.test.{ts,tsx}"],
      css: false,
    },
  }),
);
