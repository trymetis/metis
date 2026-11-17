import { z } from "zod";

import { type Enrollment, enrollmentSchema } from "../lib/enrollment";

export const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
export const HARNESS = process.env.E2E_HARNESS_URL ?? "http://localhost:8099";

export type Account = Enrollment;

const llmMissSchema = z.object({
  key: z.string(),
  path: z.string(),
  request: z.unknown(),
});
export type LlmMiss = z.infer<typeof llmMissSchema>;

const llmHitSchema = z.object({
  key: z.string(),
  path: z.string(),
  model: z.string(),
  at: z.string(),
});
export type LlmHit = z.infer<typeof llmHitSchema>;

async function get(path: string): Promise<Response> {
  const res = await fetch(`${HARNESS}${path}`);
  if (!res.ok) throw new Error(`harness ${path}: HTTP ${res.status}`);
  return res;
}

let account: Promise<Account> | undefined;

export const harness = {
  account(): Promise<Account> {
    account ??= get("/account")
      .then((r) => r.json())
      .then((body) => enrollmentSchema.parse(body));
    return account;
  },
  async totp(): Promise<string> {
    return (await (await get("/totp?fresh=1")).text()).trim();
  },
  async backupCodes(): Promise<string[]> {
    const body = z
      .object({ backupCodes: z.array(z.string()) })
      .parse(await (await get("/backup-codes")).json());
    return body.backupCodes;
  },
  async misses(): Promise<LlmMiss[]> {
    return z.array(llmMissSchema).parse(await (await get("/llm-misses")).json());
  },
  async hits(): Promise<LlmHit[]> {
    return z.array(llmHitSchema).parse(await (await get("/llm-hits")).json());
  },
};
