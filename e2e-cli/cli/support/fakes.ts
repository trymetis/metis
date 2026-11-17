import { env } from "@metis/e2e-cli/lib/env";
import { z } from "zod";

const callSchema = z.object({
  service: z.string(),
  action: z.string(),
  target: z.string(),
  detail: z.record(z.string(), z.string()).optional(),
});
export type Call = z.infer<typeof callSchema>;

export const FAKES = {
  cloudflare: `${env.fakesUrl}/cloudflare`,
  resend: `${env.fakesUrl}/resend`,
  ses: `${env.fakesUrl}/ses`,
} as const;

export async function calls(fake: keyof typeof FAKES): Promise<Call[]> {
  const res = await fetch(`${FAKES[fake]}/calls`);
  if (!res.ok) throw new Error(`[fakes] ${fake} /calls: HTTP ${res.status}`);
  return z.array(callSchema).parse(await res.json());
}

export async function clearCalls(fake: keyof typeof FAKES): Promise<void> {
  const res = await fetch(`${FAKES[fake]}/calls`, { method: "DELETE" });
  if (!res.ok) throw new Error(`[fakes] ${fake} DELETE /calls: HTTP ${res.status}`);
}

export function actions(list: Call[]): string[] {
  return list.map((call) => `${call.service} ${call.action} ${call.target}`);
}
