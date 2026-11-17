import { defineConfig } from "oxlint";

import root from "../oxlint.config.mts";

export default defineConfig({
  extends: [root],
  plugins: ["vitest"],
  env: {
    builtin: true,
    es2024: true,
    browser: true,
    node: true,
  },
  rules: {
    "eslint/no-await-in-loop": "off",
    "eslint/no-underscore-dangle": ["error", { allow: ["_meta"] }],
    "vitest/valid-expect": ["error", { maxArgs: 2 }],
  },
});
