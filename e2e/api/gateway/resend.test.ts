import { env } from "@metis/e2e/lib/env";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { uniqueName, until } from "../support/poll";
import { ana } from "../support/session";

const { gatewayUrl: GATEWAY, domain: DOMAIN, adminToken: ADMIN, controlUrl: CONTROL } = env.resend;
const SERVER = "Fernhill Updates";

interface WireEmail {
  id: string;
  subject: string;
  to: string[];
  bodyText?: string;
}

async function v1(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${GATEWAY}/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function v1Json<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await v1(token, path, init);
  expect(res.status, `${path}: ${await res.clone().text()}`).toBe(200);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- black-box client: the calling test names the response shape it expects and asserts on the values
  return (await res.json()) as T;
}

async function mint(address: string): Promise<string> {
  const { token } = await v1Json<{ token: string }>(ADMIN, "/tokens", {
    method: "POST",
    body: { address },
  });
  return token;
}

async function inbound(to: string, subject: string): Promise<void> {
  const res = await fetch(`${CONTROL}/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      from: "Raj Mehta <raj@demo.trymetis.email>",
      to,
      subject,
      text: `Body of ${subject}.`,
    }),
  });
  const body = z.object({ webhook: z.number() }).parse(await res.json());
  expect(res.status).toBe(200);
  expect(body.webhook, "the gateway accepted the signed webhook").toBe(200);
}

async function inbox(token: string): Promise<WireEmail[]> {
  return (await v1Json<{ emails: WireEmail[] }>(token, "/messages?folder=inbox")).emails;
}

const anaAddress = `ana-${Date.now().toString(36)}@${DOMAIN}`;
let anaToken = "";

beforeAll(async () => {
  anaToken = await mint(anaAddress);
});

afterAll(async () => {
  await v1(ADMIN, "/tokens", {
    method: "DELETE",
    body: { address: anaAddress },
  });
});

describe("the /v1 contract", () => {
  test("a request without a token is a 401 and the admin token never reads mail", async () => {
    expect((await fetch(`${GATEWAY}/v1/health`)).status).toBe(401);
    const health = await v1Json<{ ok: boolean; domain: string }>(ADMIN, "/health");
    expect(health).toMatchObject({ ok: true, domain: DOMAIN });
    expect((await v1(ADMIN, "/messages?folder=inbox")).status).toBe(403);
  });

  test("a signed webhook from Resend stores the message for its address only", async () => {
    const subject = `${uniqueName()} inbound`;
    await inbound(anaAddress, subject);
    const stored = (await inbox(anaToken)).find((e) => e.subject === subject);
    expect(stored).toBeDefined();
    const message = await v1Json<WireEmail>(anaToken, `/messages/${stored?.id}`);
    expect(message.bodyText).toContain(`Body of ${subject}.`);

    const unclaimed = `${uniqueName()} unclaimed`;
    await inbound(`nobody-${Date.now().toString(36)}@${DOMAIN}`, unclaimed);
    expect((await inbox(anaToken)).map((e) => e.subject)).not.toContain(unclaimed);
  });

  test("a forged webhook is refused", async () => {
    const res = await fetch(`${GATEWAY}/webhooks/resend`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": "msg_forged",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,AAAA",
      },
      body: JSON.stringify({
        type: "email.received",
        data: { email_id: "x" },
      }),
    });
    expect(res.status).toBe(401);
  });

  test("send goes out through Resend and is stored in sent", async () => {
    const subject = `${uniqueName()} outgoing`;
    const sent = await v1Json<{ id: string }>(anaToken, "/send", {
      method: "POST",
      body: {
        from: anaAddress,
        to: ["out@discard.demo.trymetis.email"],
        subject,
        html: "<p>from the e2e suite</p>",
      },
    });
    const listed = (
      await v1Json<{ emails: WireEmail[] }>(anaToken, "/messages?folder=sent")
    ).emails.find((e) => e.id === sent.id);
    expect(listed).toMatchObject({ subject });
    const atResend = z
      .array(z.object({ from: z.string(), subject: z.string() }))
      .parse(await (await fetch(`${CONTROL}/sent`)).json());
    expect(atResend).toContainEqual(expect.objectContaining({ from: anaAddress, subject }));
  });
});

describe("the app on top of the gateway", () => {
  test("a connected Resend mailbox lists, reads, archives and restores mail", async () => {
    const { rpc, account } = await ana();
    const address = `app-${Date.now().toString(36)}@${DOMAIN}`;
    const token = await mint(address);
    const subject = `${uniqueName()} through the app`;
    await inbound(address, subject);

    const connected = await rpc<{ slug: string | null }>("connections.createCredential", {
      email: address,
      credentials: { provider: "resend", server: SERVER, token },
      attachToWorkspaceSlug: account.workspaceSlug,
    });
    expect(connected.slug).toBeTruthy();
    const scope = {
      workspaceSlug: account.workspaceSlug,
      mailboxSlug: connected.slug ?? "",
    };
    const listed = async (folder: string) =>
      (
        await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
          ...scope,
          folder,
          limit: 20,
        })
      ).emails.find((e) => e.subject === subject);

    try {
      const arrived = await until(
        () => listed("inbox"),
        (e) => e !== undefined,
        { timeout: 30_000, what: "the delivered message in the app" },
      );
      const opened = await rpc<{ bodyText?: string; bodyHtml?: string }>("mail.messages.get", {
        ...scope,
        id: arrived?.id,
      });
      expect(`${opened.bodyText ?? ""}${opened.bodyHtml ?? ""}`).toContain(`Body of ${subject}.`);
      await rpc("mail.messages.archive", { ...scope, id: arrived?.id });
      const archived = await until(
        () => listed("archive"),
        (e) => e !== undefined,
        { timeout: 30_000, what: "the message in archive" },
      );
      await rpc("mail.messages.restore", { ...scope, id: archived?.id });
      expect(await listed("inbox")).toBeDefined();
    } finally {
      const { mailboxes } = await rpc<{
        mailboxes: { mailboxId: string; email: string }[];
      }>("mailboxes.list");
      const mailbox = mailboxes.find((m) => m.email === address);
      if (mailbox) await rpc("mailboxes.delete", { mailboxId: mailbox.mailboxId });
      await v1(ADMIN, "/tokens", { method: "DELETE", body: { address } });
    }
  });
});
