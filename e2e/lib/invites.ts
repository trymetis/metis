import { consoleMailHitsSchema, inviteLinkIn } from "@metis/e2e/lib/console-mail";

const INVITE_MAIL_TIMEOUT_MS = 30_000;
const INVITE_MAIL_POLL_MS = 500;

async function linkFor(harness: string, email: string, since: number): Promise<string> {
  const deadline = Date.now() + INVITE_MAIL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${harness}/console-mail-hits`);
    const link = inviteLinkIn(consoleMailHitsSchema.parse(await res.json()), email, since);
    if (link) return link;
    await new Promise((done) => setTimeout(done, INVITE_MAIL_POLL_MS));
  }
  throw new Error(`no invite email reached the console endpoint for ${email}`);
}

export async function sentInviteLink(
  harness: string,
  email: string,
  send: () => Promise<unknown>,
): Promise<string> {
  const since = Date.now() - 1_000;
  await send();
  return linkFor(harness, email, since);
}
