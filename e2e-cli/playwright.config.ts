import { ANA_STATE, APP } from "@metis/e2e/tests/harness";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: APP,
    actionTimeout: 30_000,
    channel: "chrome",
    headless: true,
    timezoneId: "UTC",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /sign-in\.setup\.ts/,
    },
    {
      name: "updates",
      testMatch: /updates\.list\.ts/,
      dependencies: ["setup"],
      workers: 1,
      use: { storageState: ANA_STATE },
    },
  ],
});
