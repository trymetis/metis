import { env } from "@metis/e2e/lib/env";
import { expect, test } from "vitest";

import { RpcError } from "../../clients/rpc";
import { setSection } from "../support/config";
import { uniqueName } from "../support/poll";
import { ana } from "../support/session";

const OUTSIDE_DOMAIN = "discard.demo.trymetis.email";

test("a sign-up invite whose email can't be sent is not created", async () => {
  const { rpc } = await ana();
  const email = `${uniqueName()}@${OUTSIDE_DOMAIN}`;
  try {
    await setSection(
      rpc,
      "mailer",
      { driver: "console", endpoint: env.consoleMail.url, token: "e2e-wrong-console-token" },
      { force: true },
    );

    const failed = await rpc("signupInvites.create", { email }).then(
      () => null,
      (err: unknown) => err,
    );
    expect(failed).toBeInstanceOf(RpcError);
    expect(failed instanceof RpcError ? failed.message : "").toBe(
      "The invite email couldn't be sent, so no invite was created. Ask the instance owner to check the mail settings, then try again.",
    );
    const { invites } = await rpc<{ invites: { email: string }[] }>("signupInvites.list");
    expect(invites.map((i) => i.email)).not.toContain(email);
  } finally {
    await setSection(rpc, "mailer", { driver: "log" });
  }
});
