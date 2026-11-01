import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["api/global-setup.ts"],
    reporters: ["verbose"],
    fileParallelism: false,
    maxConcurrency: 8,
    testTimeout: 5 * 60_000,
    hookTimeout: 5 * 60_000,
    projects: [
      {
        extends: true,
        test: { name: "mcp", include: ["api/mcp/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "rpc", include: ["api/rpc/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "workflows", include: ["api/workflows/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "gateway", include: ["api/gateway/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "system", include: ["api/system/**/*.test.ts"], testTimeout: 12 * 60_000 },
      },
    ],
  },
});
