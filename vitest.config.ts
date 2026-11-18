import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    // La tizada de un pedido de 30 prendas tarda unos segundos.
    testTimeout: 60_000,
  },
});
