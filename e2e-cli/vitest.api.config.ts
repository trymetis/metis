import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["api/updates.test.ts"],
    reporters: ["verbose"],
    fileParallelism: false,
    testTimeout: 12 * 60_000,
    hookTimeout: 5 * 60_000,
  },
});
