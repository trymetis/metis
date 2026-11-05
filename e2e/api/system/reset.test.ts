import { env } from "@metis/e2e/lib/env";
import { expect, test } from "vitest";
import { z } from "zod";

import { type Rpc, RpcError, rpcWithCookie } from "../../clients/rpc";
import { signIn } from "../../clients/sign-in";
import {
  addServer,
  type ResetView,
  resetSection,
  sectionForm,
  setSection,
} from "../support/config";
import { ana, totpCode } from "../support/session";

function imapServer(name: string) {
  return {
    name,
    "imap.host": env.imap.host,
    "imap.port": env.imap.port,
    "imap.secure": false,
    "imap.plain": true,
    "smtp.host": env.imap.host,
    "smtp.port": env.imap.smtpPort,
    "smtp.secure": false,
    "smtp.plain": true,
  };
}

function names(side: { entries: { values: Record<string, unknown> }[] }): unknown[] {
  return side.entries.map((entry) => entry.values.name);
}

async function rejection(run: () => Promise<unknown>): Promise<RpcError> {
  try {
    await run();
  } catch (err) {
    if (err instanceof RpcError) return err;
    throw err;
  }
  throw new Error("expected the call to be refused");
}

test("a reset without a code shows the environment values and changes nothing; with a code it stores them as a reset version", async () => {
  const { rpc } = await ana();
  const environment = z
    .number()
    .parse((await resetSection(rpc, "imageProxy")).environment.values.maxMb);
  try {
    await setSection(rpc, "imageProxy", { maxMb: environment + 1 });

    const preview = await resetSection(rpc, "imageProxy");
    expect(preview.updated).toBe(false);
    expect(preview.current.values.maxMb).toBe(environment + 1);
    expect(preview.environment.values.maxMb).toBe(environment);
    expect(preview.inUse).toEqual([]);
    expect((await sectionForm(rpc, "imageProxy")).values.maxMb).toBe(environment + 1);

    const reset = await resetSection(rpc, "imageProxy", { apply: true });
    expect(reset.updated).toBe(true);
    expect(reset.current.values.maxMb).toBe(environment);
    expect((await sectionForm(rpc, "imageProxy")).values.maxMb).toBe(environment);

    const history = await rpc<{
      versions: { isCurrent: boolean; kind: string; changedKeys: string[] }[];
    }>("dashboard.system.history");
    expect(history.versions.find((version) => version.isCurrent)).toMatchObject({
      kind: "reset",
      changedKeys: ["imageProxy"],
    });

    const again = await resetSection(rpc, "imageProxy", { apply: true });
    expect(again.updated).toBe(false);
  } finally {
    await resetSection(rpc, "imageProxy", { apply: true });
  }
});

test("a reset with a stale version is refused as a conflict", async () => {
  const { rpc } = await ana();
  const { version } = await sectionForm(rpc, "imageProxy");
  const err = await rejection(() =>
    rpc("dashboard.system.reset", { section: "imageProxy", expectedVersion: version + 1 }),
  );
  expect(err.code).toBe("CONFLICT");
});

test("resetting a server list removes an entry added in the dashboard that no connection uses", async () => {
  const { rpc } = await ana();
  const name = `Reset probe ${Date.now().toString(36)}`;
  try {
    await addServer(rpc, "imapServers", imapServer(name));

    const preview = await resetSection(rpc, "imapServers");
    expect(names(preview.current)).toContain(name);
    expect(names(preview.environment)).not.toContain(name);
    expect(preview.inUse).toEqual([]);

    const reset = await resetSection(rpc, "imapServers", { apply: true });
    expect(reset.updated).toBe(true);
    expect(names(await sectionForm(rpc, "imapServers"))).not.toContain(name);
  } finally {
    if (names(await sectionForm(rpc, "imapServers")).includes(name)) {
      await resetSection(rpc, "imapServers", { apply: true, force: true });
    }
  }
});

test("resetting a server list that would quarantine a connection is refused unless forced, and forcing quarantines it", async () => {
  const { rpc, account } = await ana();
  const { member } = account;
  const name = `Reset in use ${Date.now().toString(36)}`;
  let cy: Rpc | undefined;
  let connectionId: string | undefined;
  try {
    await addServer(rpc, "imapServers", imapServer(name));
    cy = rpcWithCookie(await signIn(member.email, member.password, () => totpCode(member.totpURI)));
    ({ connectionId } = await cy<{ connectionId: string }>("connections.createCredential", {
      email: member.email,
      credentials: {
        provider: "imap",
        server: name,
        user: env.imap.user,
        pass: env.imap.pass,
        smtpAuth: null,
      },
    }));

    const preview = await resetSection(rpc, "imapServers");
    expect(preview.inUse).toEqual([
      expect.objectContaining({ provider: "imap", server: name, connections: 1 }),
    ]);

    const refused = await rejection(() => resetSection(rpc, "imapServers", { apply: true }));
    expect(refused.code).toBe("PRECONDITION_FAILED");
    expect(refused.message).toContain(name);
    expect(names(await sectionForm(rpc, "imapServers"))).toContain(name);

    const forced: ResetView = await resetSection(rpc, "imapServers", { apply: true, force: true });
    expect(forced.updated).toBe(true);
    expect(forced.inUse).toEqual([]);
    expect(names(await sectionForm(rpc, "imapServers"))).not.toContain(name);
    const { connectionIds } = await cy<{ connectionIds: string[] }>("connections.unavailable");
    expect(connectionIds).toContain(connectionId);
  } finally {
    if (cy && connectionId) await cy("connections.delete", { connectionId });
    if (names(await sectionForm(rpc, "imapServers")).includes(name)) {
      await resetSection(rpc, "imapServers", { apply: true, force: true });
    }
  }
});
