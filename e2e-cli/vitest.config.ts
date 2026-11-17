import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["cli/suite.test.ts"],
    reporters: ["verbose"],
    fileParallelism: false,
    testTimeout: 20 * 60_000,
    hookTimeout: 20 * 60_000,
  },
});
