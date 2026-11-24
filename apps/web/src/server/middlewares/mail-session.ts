import "server-only";
import { ORPCError, os } from "@orpc/server";
import type { ZodType } from "zod";

import type { WorkspaceUserSession } from "@/auth/session";
import { mailSessionFor } from "@/mail/session";
import { enforceRateLimit } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

import type { MailboxScope } from "../schema";
import { workspaceSession } from "./workspace-session";

const resolveMailbox = os
  .$context<{ appUser: WorkspaceUserSession }>()
  .middleware(async ({ context, next }, input: { mailboxSlug: string }) => {
    await enforceRateLimit(context.appUser.userId, RATE_LIMITS.mailSession);
    const mail = await mailSessionFor(context.appUser, input.mailboxSlug);
    if (!mail) {
      throw new ORPCError("NOT_FOUND", { message: "Unknown mailbox" });
    }
    return next({ context: { mail } });
  });

export function mailSession<T extends ZodType<MailboxScope>>(schema: T) {
  return workspaceSession(schema).use(resolveMailbox, (input: MailboxScope) => ({
    mailboxSlug: input.mailboxSlug,
  }));
}
