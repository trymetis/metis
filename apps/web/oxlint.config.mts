import { defineConfig } from "oxlint";

import root from "../../oxlint.config.mts";

export default defineConfig({
  extends: [root],
  plugins: ["react", "nextjs", "jsx-a11y"],
  env: {
    builtin: true,
    es2024: true,
    browser: true,
    node: true,
  },
  settings: {
    react: {
      version: "19.3.1",
    },
    "jsx-a11y": {
      components: {
        AuthInput: "input",
        Checkbox: "input",
        Switch: "input",
      },
    },
  },
  rules: {
    "jsx-a11y/control-has-associated-label": ["error", { depth: 3 }],
    "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],
  },
  overrides: [
    {
      files: ["scripts/e2e/**"],
      rules: {
        "eslint/no-await-in-loop": "off",
      },
    },
    {
      files: ["**/*-worker.ts"],
      rules: {
        "unicorn/require-post-message-target-origin": "off",
      },
    },
  ],
  ignorePatterns: [
    "src/components/ai-elements/**",
    "src/components/ui/svgs/**",
    "src/db/auth-schema.ts",
    "src/drive/icons.ts",
    "src/mail/render/clearurls.ts",
    "src/mail/render/trackers.ts",
  ],
});
