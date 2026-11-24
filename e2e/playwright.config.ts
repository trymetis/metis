import { defineConfig } from "@playwright/test";

import { ANA_STATE, APP } from "./tests/harness";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalTeardown: "./tests/global-teardown.ts",
  use: {
    baseURL: APP,
    channel: "chrome",
    headless: true,
    timezoneId: "UTC",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\/.+\.setup\.ts/,
    },
    {
      name: "read",
      testMatch: /read\/.+\.spec\.ts/,
      dependencies: ["setup"],
      fullyParallel: true,
      workers: 4,
      metadata: { parallel: true },
      use: { storageState: ANA_STATE },
    },
    {
      name: "write",
      testMatch: /write\/order\.list\.ts/,
      dependencies: ["read"],
      timeout: 12 * 60_000,
      workers: 1,
      use: { storageState: ANA_STATE },
    },
  ],
});
