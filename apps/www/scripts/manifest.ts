import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

const MANIFEST = join(import.meta.dirname, "..", "src", "content", "shots.json");

const manifestSchema = z.record(z.string(), z.array(z.number()).nullable());
export type Manifest = z.infer<typeof manifestSchema>;

export function readManifest(): Manifest {
  try {
    return manifestSchema.parse(JSON.parse(readFileSync(MANIFEST, "utf8")));
  } catch {
    return {};
  }
}

export function writeManifest(manifest: Manifest) {
  const sorted = Object.fromEntries(
    Object.entries(manifest).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
}
