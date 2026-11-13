# Lint

The oxlint rule set: what the root config turns on, off or tunes and why, the per-workspace settings, and how a rule is suppressed for one line. Paths are relative to the repository root. The config mechanics (`.mts`, `extends`, `--type-aware`) are hard constraints in [AGENTS.md](../AGENTS.md) §2; the exemptions that belong to one domain live in its doc ([e2e.md](e2e.md), [www.md](www.md), `apps/docs/AGENTS.md`).

## Code map

| Concern                                                                                                                    | Where                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Root rule set (plugins, categories, rule options)                                                                          | `oxlint.config.mts`                      |
| Web JSX settings and label depth, worker and e2e-script overrides                                                          | `apps/web/oxlint.config.mts`             |
| www exhibit-model and screenshot-script overrides                                                                          | `apps/www/oxlint.config.mts`             |
| docs `.astro` and screenshot-script overrides                                                                              | `apps/docs/oxlint.config.mts`            |
| e2e rule set                                                                                                               | `e2e/oxlint.config.mts`                  |
| Lint scripts (`--type-aware`, `--report-unused-disable-directives`)                                                        | root `package.json` → `lint`, `lint:fix` |
| CI on every push and pull request (typecheck, then lint; `gofmt -l`, `go vet` and `go test` in `apps/cli` and `e2e/fakes`) | `.github/workflows/ci.yml`               |

## Rules

- **The root config turns on the `correctness` and `suspicious` categories as errors and `perf` as warnings**; every rule below is a deliberate change to that set.
- **`typescript/consistent-return` is off; `noImplicitReturns` is on in every tsconfig instead.**
  - TypeScript knows that an exhaustive `switch` returns on every path and that a `never` call ends one; the lint rule does not, so it flags correct code.
  - TypeScript also allows a bare `return;` where the return type includes `undefined`, which is every React effect with a cleanup.
- **`oxc/no-map-spread` is off.** Its only fix mutates each mapped item in place, which corrupts shared constants and cannot change a field's type (a `Date` to an ISO string).
- **`jsx-a11y/no-autofocus` is off.** Autofocus is deliberate in dialogs and on single-field auth pages.
- **`jsx-a11y/prefer-tag-over-role` is off.** Every flagged role is a correct ARIA pattern no native tag expresses: `role="img"` on inline SVG, listbox options, radio-like buttons, the compose dialog, a status bar that holds buttons.
- **`promise/always-return` sets `ignoreLastCallback`.** A `.then()` whose result nothing reads has no later callback to starve; a `.then()` whose promise is kept must still return or be written as an async function.
- **`import/no-unassigned-import` allows the side-effect imports by name** (`server-only`, stylesheets, fonts, polyfills, entry points, the pdf.js worker, `@/lib/orpc.server`). Any other bare import is an error.
- **Web maps `Checkbox`, `Switch` and `AuthInput` to `input` for jsx-a11y**, so a `<label>` that wraps a Base UI control counts as labelled, and both label rules search three levels deep for text.
- **A suppression names its rule and gives a reason**: `// oxlint-disable-next-line <plugin>/<rule> -- <reason>`, or a `/* oxlint-disable … */` … `/* oxlint-enable … */` pair around a loop with several hits.
  - `--report-unused-disable-directives` fails a directive that no longer suppresses anything.
- **`typescript/no-unsafe-type-assertion` is on everywhere: data from outside the type system is checked, not asserted.**
  - JSON from a request, a response, storage or a file goes through a zod schema (`safeParse` where a bad value is ignored); union members through a guard such as `isOneOf` or `isRecord` (`src/lib/guards.ts`); DOM and three.js objects through `instanceof`.
  - A directive remains only where a library's types are wrong or narrower than its runtime, and names that library.
- **`eslint/no-await-in-loop` stays on for product code.** Independent iterations use `Promise.all`; a loop that must run in order (a cursor, a retry, one connection, a transaction, a rate limit) carries a directive saying which.

## Deliberate limits

- **The React Compiler is not enabled**, so the compiler-derived rules (`react/refs`, `react/immutability`, `react/memo-dependencies`, `react/incompatible-library`) guard correctness only; `incompatible-library` findings are suppressed with that reason.
- **oxlint's compiler port loses references inside a `try` that has a `finally`.** It reports such a `useCallback`'s dependencies as unnecessary; those four sites carry a directive naming the bug.
