import { type ConsoleMailHit, consoleMailHitsSchema } from "@metis/e2e/lib/console-mail";
import { expect, test } from "vitest";

import { HARNESS } from "../../clients/harness";
import { type Rpc, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import { until } from "../support/poll";
import { ana, totpCode } from "../support/session";

const QUIET_MS = 3_000;
const SUBJECT = "New sign-in to your Metis Suite account";

async function alertsTo(address: string): Promise<ConsoleMailHit[]> {
  const res = await fetch(`${HARNESS}/console-mail-hits`);
  const hits = consoleMailHitsSchema.parse(await res.json());
  return hits.filter((hit) => hit.to === address && hit.subject === SUBJECT);
}

test("a sign-in emails the member an alert, and none once they turn alerts off", async () => {
  const { account } = await ana();
  const { member } = account;
  const signInMember = async (): Promise<Rpc> =>
    rpcWithCookie(await signIn(member.email, member.password, () => totpCode(member.totpURI)));
  let cy: Rpc | undefined;
  try {
    const before = (await alertsTo(member.email)).length;
    cy = await signInMember();
    const alerts = await until(
      () => alertsTo(member.email),
      (hits) => hits.length > before,
      { timeout: 30_000, what: "the sign-in alert at the console endpoint" },
    );
    const alert = alerts.at(-1);
    expect(alert?.text).toContain("Authenticator code");
    expect(alert?.text).toContain("/settings/account");

    await cy("user.updatePreferences", { signInAlerts: false });
    const { events } = await cy<{ events: { action: string }[] }>("audit.mine");
    expect(events).toContainEqual(expect.objectContaining({ action: "sign_in_alerts.disabled" }));

    const quiet = (await alertsTo(member.email)).length;
    await signInMember();
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS));
    expect(await alertsTo(member.email)).toHaveLength(quiet);
  } finally {
    await cy?.("user.updatePreferences", { signInAlerts: true });
  }
});
