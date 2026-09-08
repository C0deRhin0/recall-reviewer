import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  reporter: "list",
  outputDir: "test-results",
});
// Align local documentation for playwright config module
// Review follow-up details for playwright config module
