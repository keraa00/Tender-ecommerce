import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Isolation tests (week 2) share one database and seed distinct tenants, so
    // they must not run concurrently against each other.
    fileParallelism: false,
  },
});
