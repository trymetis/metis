import { defineConfig } from "oxlint";

import root from "../../oxlint.config.mts";

export default defineConfig({
  extends: [root],
  plugins: ["react", "jsx-a11y"],
  env: {
    builtin: true,
    es2024: true,
    browser: true,
  },
  settings: {
    react: {
      version: "19.3.1",
    },
  },
  ignorePatterns: ["src/components/*.tsx", "!src/components/metis-mark.tsx"],
});
