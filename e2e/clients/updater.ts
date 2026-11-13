import { z } from "zod";

export const UPDATER = "http://localhost:8097";

const updaterSettingsSchema = z.object({
  current: z.string(),
  releases: z.array(z.string()),
  notes: z.record(z.string(), z.string()),
  rollback: z.string(),
  snapshots: z.boolean(),
  outcome: z.enum(["succeed", "preflight-fails", "never-ready", "restore-fails"]),
  stepMs: z.number(),
  minCli: z.record(z.string(), z.string()),
});
export type UpdaterSettings = z.infer<typeof updaterSettingsSchema>;
export type UpdaterOutcome = UpdaterSettings["outcome"];

const updaterStateSchema = z.object({
  up: z.boolean(),
  settings: updaterSettingsSchema,
  upgrade: z
    .object({
      state: z.string(),
      toVersion: z.string(),
      fromVersion: z.string().optional(),
    })
    .nullable(),
});
export type UpdaterState = z.infer<typeof updaterStateSchema>;

async function post(path: string, body?: Partial<UpdaterSettings>): Promise<UpdaterState> {
  const res = await fetch(`${UPDATER}${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`updater ${path}: HTTP ${res.status}`);
  return updaterStateSchema.parse(await res.json());
}

export const updater = {
  reset: (settings: Partial<UpdaterSettings> = {}) => post("/reset", settings),
  hold: () => post("/hold"),
  down: () => post("/down"),
  up: () => post("/up"),
  async state(): Promise<UpdaterState> {
    const res = await fetch(`${UPDATER}/state`);
    if (!res.ok) throw new Error(`updater /state: HTTP ${res.status}`);
    return updaterStateSchema.parse(await res.json());
  },
};
