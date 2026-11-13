import { env } from "@metis/e2e/lib/env";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { uniqueName, until } from "../support/poll";
import { ana } from "../support/session";

const { gatewayUrl: GATEWAY, domain: DOMAIN, adminToken: ADMIN, controlUrl: CONTROL } = env.ses;
const SERVER = "Fernhill Team";

interface WireEmail {
  id: string;
  threadId: string;
  subject: string;
  folder: string;
  to: string[];
  bodyText?: string;
  attachments?: { id: string; filename: string; mimeType: string; size: number }[];
}

const inboundReplySchema = z.object({
  messageId: z.string(),
  result: z.object({ ok: z.literal(true), outcomes: z.array(z.string()) }),
});

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

async function revoke(address: string): Promise<void> {
  await v1(ADMIN, "/tokens", { method: "DELETE", body: { address } });
}

async function inbound(
  to: string[],
  subject: string,
  extra: {
    spam?: string;
    attachment?: { filename: string; contentType: string; text: string };
  } = {},
): Promise<z.infer<typeof inboundReplySchema>> {
  const res = await fetch(`${CONTROL}/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      from: "Raj Mehta <raj@demo.trymetis.email>",
      to,
      subject,
      text: `Body of ${subject}.`,
      ...(extra.spam ? { spam: extra.spam } : {}),
      ...(extra.attachment
        ? {
            attachment: {
              filename: extra.attachment.filename,
              contentType: extra.attachment.contentType,
              contentBase64: Buffer.from(extra.attachment.text).toString("base64"),
            },
          }
        : {}),
    }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return inboundReplySchema.parse(await res.json());
}

async function objectKeys(prefix: string): Promise<string[]> {
  const res = await fetch(`${CONTROL}/objects?prefix=${encodeURIComponent(prefix)}`);
  return z.object({ keys: z.array(z.string()) }).parse(await res.json()).keys;
}

async function folder(token: string, name: string): Promise<WireEmail[]> {
  return (await v1Json<{ emails: WireEmail[] }>(token, `/messages?folder=${name}`)).emails;
}

const stamp = Date.now().toString(36);
const anaAddress = `ana-${stamp}@${DOMAIN}`;
const cyAddress = `cy-${stamp}@${DOMAIN}`;
let anaToken = "";
let cyToken = "";

beforeAll(async () => {
  anaToken = await mint(anaAddress);
  cyToken = await mint(cyAddress);
});

afterAll(async () => {
  await revoke(anaAddress);
  await revoke(cyAddress);
});

describe("the /v1 contract", () => {
  test("a request without a token is a 401 and the admin token never reads mail", async () => {
    expect((await fetch(`${GATEWAY}/v1/health`)).status).toBe(401);
    const health = await v1Json<{ ok: boolean; backend: string; domain: string }>(ADMIN, "/health");
    expect(health).toMatchObject({ ok: true, backend: "ses", domain: DOMAIN });
    expect((await v1(ADMIN, "/messages?folder=inbox")).status).toBe(403);
  });

  test("a receipt stores one row per claimed recipient, with its own attachment copy", async () => {
    const subject = `${uniqueName()} inbound`;
    const nobody = `nobody-${stamp}@${DOMAIN}`;
    const { messageId, result } = await inbound([anaAddress, cyAddress, nobody], subject, {
      attachment: { filename: "agenda.txt", contentType: "text/plain", text: "Agenda" },
    });
    expect(result.outcomes).toEqual(["stored"]);

    const forAna = (await folder(anaToken, "inbox")).find((e) => e.subject === subject);
    const forCy = (await folder(cyToken, "inbox")).find((e) => e.subject === subject);
    expect(forAna).toBeDefined();
    expect(forCy).toBeDefined();
    expect(forAna?.id).not.toBe(forCy?.id);

    const message = await v1Json<WireEmail>(anaToken, `/messages/${forAna?.id}`);
    expect(message.bodyText).toContain(`Body of ${subject}.`);
    expect(message.attachments).toEqual([
      expect.objectContaining({ id: "0", filename: "agenda.txt", mimeType: "text/plain" }),
    ]);
    const file = await v1(anaToken, `/messages/${forAna?.id}/attachments/0`);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe("Agenda");

    const raw = await v1(cyToken, `/messages/${forCy?.id}/raw`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toContain(`Body of ${subject}.`);

    expect(await objectKeys(messageId)).toEqual([messageId]);
    expect(await objectKeys(`att/${forAna?.id}/`)).toEqual([`att/${forAna?.id}/0`]);
    expect(await objectKeys(`att/${forCy?.id}/`)).toEqual([`att/${forCy?.id}/0`]);
  });

  test("the shared raw message is deleted with its last row", async () => {
    const subject = `${uniqueName()} shared`;
    const { messageId } = await inbound([anaAddress, cyAddress], subject);
    const forAna = (await folder(anaToken, "inbox")).find((e) => e.subject === subject);
    const forCy = (await folder(cyToken, "inbox")).find((e) => e.subject === subject);

    for (let pass = 0; pass < 2; pass += 1) {
      await v1Json(anaToken, "/messages/delete", { method: "POST", body: { ids: [forAna?.id] } });
    }
    expect(await objectKeys(messageId), "Cy's row still holds the raw message").toEqual([
      messageId,
    ]);

    for (let pass = 0; pass < 2; pass += 1) {
      await v1Json(cyToken, "/messages/delete", { method: "POST", body: { ids: [forCy?.id] } });
    }
    expect(await objectKeys(messageId)).toEqual([]);
  });

  test("mail for addresses with no token is dropped and its raw message deleted", async () => {
    const subject = `${uniqueName()} unclaimed`;
    const { messageId, result } = await inbound([`nobody-${stamp}@${DOMAIN}`], subject);
    expect(result.outcomes).toEqual(["unclaimed"]);
    expect(await objectKeys(messageId)).toEqual([]);
    expect((await folder(anaToken, "inbox")).map((e) => e.subject)).not.toContain(subject);
  });

  test("mail SES marks as spam lands in the Spam folder", async () => {
    const subject = `${uniqueName()} spam`;
    await inbound([anaAddress], subject, { spam: "FAIL" });
    expect((await folder(anaToken, "spam")).map((e) => e.subject)).toContain(subject);
    expect((await folder(anaToken, "inbox")).map((e) => e.subject)).not.toContain(subject);
  });

  test("send goes out through SES and threads the sent copy on SES's Message-ID", async () => {
    const subject = `${uniqueName()} outgoing`;
    const sent = await v1Json<{ id: string }>(anaToken, "/send", {
      method: "POST",
      body: {
        from: anaAddress,
        to: ["out@discard.demo.trymetis.email"],
        bcc: ["hidden@discard.demo.trymetis.email"],
        subject,
        bodyHtml: "<p>from the e2e suite</p>",
      },
    });
    const listed = (await folder(anaToken, "sent")).find((e) => e.id === sent.id);
    expect(listed).toMatchObject({ subject });

    const atSes = z
      .array(
        z.object({
          messageId: z.string(),
          from: z.string(),
          to: z.array(z.string()),
          bcc: z.array(z.string()),
          subject: z.string(),
        }),
      )
      .parse(await (await fetch(`${CONTROL}/sent`)).json());
    const delivered = atSes.find((e) => e.subject === subject);
    expect(delivered).toMatchObject({
      from: anaAddress,
      to: ["out@discard.demo.trymetis.email"],
      bcc: ["hidden@discard.demo.trymetis.email"],
    });
    expect(listed?.threadId).toBe(`${delivered?.messageId}@email.amazonses.com`);
  });

  test("a token only sends as its own address", async () => {
    const res = await v1(anaToken, "/send", {
      method: "POST",
      body: { from: cyAddress, to: ["out@discard.demo.trymetis.email"], subject: "spoof" },
    });
    expect(res.status).toBe(403);
  });
});

describe("the app on top of the gateway", () => {
  test("a connected Amazon SES mailbox lists, reads, archives and restores mail", async () => {
    const { rpc, account } = await ana();
    const address = `app-${stamp}@${DOMAIN}`;
    const token = await mint(address);
    const subject = `${uniqueName()} through the app`;
    await inbound([address], subject);

    const connected = await rpc<{ slug: string | null }>("connections.createCredential", {
      email: address,
      credentials: { provider: "ses", server: SERVER, token },
      attachToWorkspaceSlug: account.workspaceSlug,
    });
    expect(connected.slug).toBeTruthy();
    const scope = {
      workspaceSlug: account.workspaceSlug,
      mailboxSlug: connected.slug ?? "",
    };
    const listed = async (name: string) =>
      (
        await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
          ...scope,
          folder: name,
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
      await revoke(address);
    }
  });
});
