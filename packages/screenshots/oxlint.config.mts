import { defineConfig } from "oxlint";

import root from "../../oxlint.config.mts";

export default defineConfig({
  extends: [root],
  env: {
    builtin: true,
    es2024: true,
    browser: true,
    node: true,
  },
  overrides: [
    {
      files: ["src/**"],
      rules: {
        "eslint/no-await-in-loop": "off",
      },
    },
  ],
});
