import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "maintenance",
    include: ["maintenance/**/*.test.ts"],
    reporters: ["verbose"],
    testTimeout: 60_000,
  },
});
