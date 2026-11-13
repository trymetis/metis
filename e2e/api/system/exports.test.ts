import { SEEDED_EXPORTS } from "@metis/e2e/lib/exports";
import { expect, test } from "vitest";

import { ana } from "../support/session";

test("the owner reads every recorded export, newest first, with where each archive went", async () => {
  const { rpc } = await ana();
  const { exports } = await rpc<{ exports: (Record<string, unknown> & { id: string })[] }>(
    "dashboard.system.exports",
  );
  const newestFirst = SEEDED_EXPORTS.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  expect(exports.map(({ id: _id, ...entry }) => entry)).toEqual(newestFirst);
  expect(new Set(exports.map((entry) => entry.id)).size).toBe(exports.length);
});
