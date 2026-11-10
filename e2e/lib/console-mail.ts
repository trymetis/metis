import { z } from "zod";

export const consoleMailSchema = z.object({
  to: z.string(),
  from: z.string(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});

export const consoleMailHitsSchema = z.array(consoleMailSchema.extend({ at: z.string() }));
export type ConsoleMailHit = z.infer<typeof consoleMailHitsSchema>[number];

export const INVITE_LINK = /https?:\/\/\S+\/invite\/accept\?token=[A-Za-z0-9_-]+/;

export function inviteLinkIn(hits: ConsoleMailHit[], email: string, since: number): string | null {
  return (
    hits
      .filter((hit) => hit.to === email && Date.parse(hit.at) >= since)
      .map((hit) => INVITE_LINK.exec(hit.text)?.[0])
      .findLast((found) => found !== undefined) ?? null
  );
}

export function inviteToken(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`no token in ${link}`);
  return token;
}
