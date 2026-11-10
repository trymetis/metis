import { env } from "@metis/e2e/lib/env";
import { expect, test } from "vitest";

import { type Rpc, RpcError, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { setSection, withTotp } from "../support/config";
import { uniqueName } from "../support/poll";
import { ana, totpCode } from "../support/session";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";

interface Users {
  users: { id: string; email: string }[];
}

interface Invites {
  invites: { id: string; email: string }[];
}

interface AuditPage {
  events: { action: string; targetLabel: string | null }[];
}

async function member(): Promise<{ rpc: Rpc; userId: string }> {
  const { rpc, account } = await ana();
  const cookie = await signIn(account.member.email, account.member.password, () =>
    totpCode(account.member.totpURI),
  );
  const { users } = await rpc<Users>("dashboard.users.list", {});
  const userId = users.find((u) => u.email === account.member.email)?.id;
  if (!userId) throw new Error("the member is not listed");
  return { rpc: rpcWithCookie(cookie), userId };
}

async function failure(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

test("an account invite whose email can't be sent is kept only for the owner, who is shown its link", async () => {
  const { rpc } = await ana();
  const cy = await member();
  const ownerEmail = `${uniqueName()}-owner@${OUTSIDE_DOMAIN}`;
  const adminEmail = `${uniqueName()}-admin@${OUTSIDE_DOMAIN}`;
  await withTotp((code) =>
    rpc("dashboard.users.setRole", { userId: cy.userId, role: "admin", code }),
  );
  try {
    await setSection(
      rpc,
      "mailer",
      { driver: "console", endpoint: env.consoleMail.url, token: "e2e-wrong-console-token" },
      { force: true },
    );

    const kept = await rpc<{ invite: { id: string }; link: string | null }>(
      "dashboard.invites.create",
      { email: ownerEmail, instanceRole: null },
    );
    expect(kept.link).toMatch(/\/invite\/accept\?token=[A-Za-z0-9_-]+$/);
    const listed = await rpc<Invites>("dashboard.invites.list", {});
    expect(listed.invites.map((i) => i.email)).toContain(ownerEmail);
    const { events } = await rpc<AuditPage>("audit.mine");
    for (const action of ["invite.created", "invite.link_shown"]) {
      expect(events).toContainEqual(expect.objectContaining({ action, targetLabel: ownerEmail }));
    }
    await rpc("dashboard.invites.revoke", { inviteId: kept.invite.id });

    const refused = await failure(
      cy.rpc("dashboard.invites.create", { email: adminEmail, instanceRole: null }),
    );
    expect(refused.message).toBe(
      "The invite email couldn't be sent, so no invite was created. Ask the instance owner to check the mail settings, then try again.",
    );
    const after = await rpc<Invites>("dashboard.invites.list", {});
    expect(after.invites.map((i) => i.email)).not.toContain(adminEmail);
  } finally {
    await setSection(rpc, "mailer", {
      driver: "console",
      endpoint: env.consoleMail.url,
      token: env.consoleMail.token,
    });
    await withTotp((code) =>
      rpc("dashboard.users.setRole", { userId: cy.userId, role: "user", code }),
    );
  }
});
