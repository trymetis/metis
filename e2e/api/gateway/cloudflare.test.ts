import { env } from "@metis/e2e/lib/env";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { uniqueName, until } from "../support/poll";
import { ana } from "../support/session";

const { url: GATEWAY, domain: DOMAIN, adminToken: ADMIN } = env.gateway;
const SERVER = "Fernhill Inbound";

interface WireEmail {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  folder: string;
  bodyText?: string;
}

function bearer(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function v1(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  return fetch(`${GATEWAY}/v1${path}`, {
    method: init.method ?? "GET",
    headers: bearer(token),
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

async function deliver(
  to: string,
  mail: { subject: string; messageId: string; date?: string },
): Promise<void> {
  const raw = [
    "From: Raj Mehta <raj@demo.trymetis.email>",
    `To: ${to}`,
    `Subject: ${mail.subject}`,
    `Date: ${mail.date ?? new Date().toUTCString()}`,
    `Message-ID: ${mail.messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Body of ${mail.subject}.`,
    "",
  ].join("\r\n");
  const res = await fetch(
    `${GATEWAY}/cdn-cgi/local/email?from=raj@demo.trymetis.email&to=${encodeURIComponent(to)}`,
    { method: "POST", body: raw },
  );
  expect(res.status, await res.clone().text()).toBe(200);
}

async function inbox(token: string, query = ""): Promise<WireEmail[]> {
  return (await v1Json<{ emails: WireEmail[] }>(token, `/messages?folder=inbox${query}`)).emails;
}

const anaAddress = `ana-${Date.now().toString(36)}@${DOMAIN}`;
const boAddress = `bo-${Date.now().toString(36)}@${DOMAIN}`;
let anaToken = "";
let boToken = "";

beforeAll(async () => {
  anaToken = await mint(anaAddress);
  boToken = await mint(boAddress);
});

afterAll(async () => {
  for (const address of [anaAddress, boAddress]) {
    await v1(ADMIN, "/tokens", { method: "DELETE", body: { address } });
  }
});

describe("the /v1 contract", () => {
  test("a request without a token is a 401", async () => {
    const res = await fetch(`${GATEWAY}/v1/health`);
    expect(res.status).toBe(401);
  });

  test("the admin token manages tokens but never reads mail", async () => {
    const health = await v1Json<{ ok: boolean; domain: string }>(ADMIN, "/health");
    expect(health).toMatchObject({ ok: true, domain: DOMAIN });
    const { tokens } = await v1Json<{ tokens: { address: string }[] }>(ADMIN, "/tokens");
    expect(tokens.map((t) => t.address)).toEqual(expect.arrayContaining([anaAddress, boAddress]));
    expect((await v1(ADMIN, "/messages?folder=inbox")).status).toBe(403);
    expect((await v1(anaToken, "/tokens")).status).toBe(403);
  });

  test("a token is scoped to one address", async () => {
    const health = await v1Json<{ address: string }>(anaToken, "/health");
    expect(health.address).toBe(anaAddress);
    const subject = `${uniqueName()} for bo`;
    await deliver(boAddress, {
      subject,
      messageId: `<${uniqueName()}@demo.trymetis.email>`,
    });
    expect((await inbox(boToken)).map((e) => e.subject)).toContain(subject);
    expect((await inbox(anaToken)).map((e) => e.subject)).not.toContain(subject);
    const res = await v1(anaToken, "/send", {
      method: "POST",
      body: {
        from: boAddress,
        to: [`x@discard.demo.trymetis.email`],
        subject: "spoofed",
        html: "<p>no</p>",
      },
    });
    expect(res.status).toBe(403);
  });

  test("ingest normalises the recipient and skips a known Message-ID", async () => {
    const subject = uniqueName();
    const messageId = `<${uniqueName()}@demo.trymetis.email>`;
    await deliver(anaAddress.toUpperCase(), { subject, messageId });
    await deliver(anaAddress, { subject, messageId });
    const copies = (await inbox(anaToken)).filter((e) => e.subject === subject);
    expect(copies).toHaveLength(1);
  });

  test("list pages with a cursor, read returns the body, search finds by subject", async () => {
    const tag = uniqueName();
    for (const [index, day] of ["10", "11", "12"].entries()) {
      await deliver(anaAddress, {
        subject: `${tag} page ${index}`,
        messageId: `<${tag}-${index}@demo.trymetis.email>`,
        date: `Mon, ${day} Aug 2026 09:00:00 +0000`,
      });
    }
    const first = await v1Json<{
      emails: WireEmail[];
      nextCursor?: string;
    }>(anaToken, "/messages?folder=inbox&limit=2");
    expect(first.emails).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await v1Json<{ emails: WireEmail[] }>(
      anaToken,
      `/messages?folder=inbox&limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
    );
    const seen = [...first.emails, ...second.emails].map((e) => e.id);
    expect(new Set(seen).size).toBe(seen.length);

    const found = await v1Json<{ emails: WireEmail[] }>(
      anaToken,
      `/search?q=${encodeURIComponent(`${tag} page 1`)}`,
    );
    expect(found.emails.map((e) => e.subject)).toEqual([`${tag} page 1`]);
    const message = await v1Json<WireEmail>(anaToken, `/messages/${found.emails[0]?.id}`);
    expect(message.bodyText).toContain(`Body of ${tag} page 1.`);
  });

  test("send stores the message in sent", async () => {
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
    expect(listed).toMatchObject({ subject, to: ["out@discard.demo.trymetis.email"] });
  });
});

describe("the app on top of the gateway", () => {
  test("a connected gateway mailbox lists, reads, archives and restores mail", async () => {
    const { rpc, account } = await ana();
    const address = `app-${Date.now().toString(36)}@${DOMAIN}`;
    const token = await mint(address);
    const subject = `${uniqueName()} through the app`;
    await deliver(address, {
      subject,
      messageId: `<${uniqueName()}@demo.trymetis.email>`,
    });

    const connected = await rpc<{ slug: string | null }>("connections.createCredential", {
      email: address,
      credentials: { provider: "cloudflare", server: SERVER, token },
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
      expect(await listed("inbox")).toBeUndefined();
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
