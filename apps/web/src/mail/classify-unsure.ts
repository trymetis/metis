import "server-only";
import { getCache } from "@/services/cache";

const UNSURE_TTL_SEC = 7 * 24 * 60 * 60;

function unsureKey(mailboxId: string): string {
  return `classify-unsure:${mailboxId}`;
}

export async function unsureMessages(
  targets: { mailboxId: string; messageId: string }[],
): Promise<Set<string>> {
  const byMailbox = new Map<string, string[]>();
  for (const { mailboxId, messageId } of targets) {
    byMailbox.set(mailboxId, [...(byMailbox.get(mailboxId) ?? []), messageId]);
  }
  const unsure = new Set<string>();
  await Promise.all(
    [...byMailbox].map(async ([mailboxId, messageIds]) => {
      const flags = await getCache().hmget(unsureKey(mailboxId), messageIds);
      flags.forEach((flag, index) => {
        const messageId = messageIds[index];
        if (flag !== null && messageId) unsure.add(`${mailboxId}:${messageId}`);
      });
    }),
  );
  return unsure;
}

export async function markUnsure(
  targets: { mailboxId: string; messageId: string }[],
): Promise<void> {
  await Promise.all(
    targets.map(({ mailboxId, messageId }) =>
      getCache().hsetExpiring(unsureKey(mailboxId), messageId, "1", UNSURE_TTL_SEC),
    ),
  );
}

export async function forgetUnsure(mailboxIds: string[]): Promise<void> {
  await Promise.all(mailboxIds.map((mailboxId) => getCache().del(unsureKey(mailboxId))));
}
