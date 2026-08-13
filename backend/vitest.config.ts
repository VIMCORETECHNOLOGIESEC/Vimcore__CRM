import { defineConfig } from "vitest/config";

// D-H: las pruebas de integración corren contra la BD real de compose (`db`),
// nunca contra una base separada. `tests/setup.ts` aborta si NODE_ENV !== "test".
export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
  },
});
