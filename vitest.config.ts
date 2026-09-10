import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
// Capture a cleanup item for vitest config module
// Clarify implementation notes for vitest config module
