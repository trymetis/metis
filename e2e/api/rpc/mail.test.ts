import { env } from "@metis/e2e/lib/env";
import { beforeAll, describe, expect, test } from "vitest";

import { APP } from "../../clients/harness";
import type { Rpc } from "../../clients/rpc";
import { ana, mailboxScope } from "../support/session";

interface Listed {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  date: string;
  messageIdHeader?: string;
}

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

const EDGE_DOMAIN = "@edge.test";
const LONG = 20 * 60_000;

function caseOf(e: Listed): string {
  const header = e.messageIdHeader ?? "";
  const match = /^<edge-(.+)-\d+@edge\.test>$/.exec(header);
  return match?.[1] ?? `${header}|${e.subject}`;
}

function onePerCase(emails: Listed[]): Listed[] {
  const seen = new Map<string, Listed>();
  for (const e of emails) if (!seen.has(caseOf(e))) seen.set(caseOf(e), e);
  return [...seen.values()];
}

function isEdge(e: Listed): boolean {
  return (e.messageIdHeader ?? "").endsWith(`${EDGE_DOMAIN}>`) || e.from.endsWith(EDGE_DOMAIN);
}

async function listInbox(rpc: Rpc, scope: object): Promise<Listed[]> {
  const all: Listed[] = [];
  let pageToken: string | undefined;
  do {
    const page = await rpc<{ emails: Listed[]; nextPageToken?: string }>("mail.messages.list", {
      ...scope,
      folder: "inbox",
      limit: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    all.push(...page.emails);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return all;
}

describe.skipIf(!env.edge)("malformed and oversized mail", () => {
  let rpc: Rpc;
  let scope: object;
  let pageBase: string;
  let cookie: string;
  let inbox: Listed[];
  let edge: Listed[];
  let everyEdge: Listed[];

  function named(subject: string): Listed {
    const found = everyEdge.find((e) => e.subject === subject);
    if (!found) throw new Error(`edge message "${subject}" is not in the inbox`);
    return found;
  }

  function body(subject: string): Promise<{ bodyText?: string; bodyHtml?: string }> {
    return rpc("mail.messages.get", { ...scope, id: named(subject).id, folder: "inbox" });
  }

  function mailPage(page: string, params: Record<string, string>): Promise<Response> {
    return fetch(`${pageBase}/${page}?${new URLSearchParams(params).toString()}`, {
      headers: { cookie },
    });
  }

  beforeAll(async () => {
    const session = await ana();
    rpc = session.rpc;
    cookie = session.cookie;
    scope = mailboxScope(session.account);
    pageBase = `${APP}/w/${session.account.workspaceSlug}/m/${session.account.mailboxSlug}`;
    inbox = await listInbox(rpc, scope);
    everyEdge = inbox.filter(isEdge);
    edge = onePerCase(everyEdge);
  }, LONG);

  test("every inbox page lists, and every listed message has a subject and a readable date", () => {
    expect(everyEdge.length).toBeGreaterThan(0);
    for (const e of inbox) {
      expect(typeof e.subject, e.id).toBe("string");
      expect(Number.isFinite(Date.parse(e.date)), `${e.subject}: date "${e.date}"`).toBe(true);
    }
  });

  test("the realistic mail lists ahead of the older edge mail", () => {
    const firstEdge = inbox.findIndex(isEdge);
    expect(firstEdge).toBeGreaterThanOrEqual(100);
  });

  test(
    "every edge message opens",
    async () => {
      const failed: string[] = [];
      for (const e of edge) {
        try {
          await rpc("mail.messages.get", { ...scope, id: e.id, folder: "inbox" });
        } catch (err) {
          failed.push(`${e.subject}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      expect(failed).toEqual([]);
    },
    LONG,
  );

  test(
    "every edge thread resolves and contains the message it was opened from",
    async () => {
      const threads = new Map<string, Listed>();
      for (const e of edge) if (e.threadId && !threads.has(e.threadId)) threads.set(e.threadId, e);
      expect(threads.size).toBeGreaterThan(0);
      const failed: string[] = [];
      for (const [threadId, opened] of threads) {
        try {
          const { messages } = await rpc<{ messages: { id: string }[] }>("mail.thread.get", {
            ...scope,
            threadId,
          });
          if (!messages.some((m) => m.id === opened.id)) failed.push(`${opened.subject}: missing`);
        } catch (err) {
          failed.push(`${opened.subject}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      expect(failed).toEqual([]);
    },
    LONG,
  );

  test("reference loops and self-references resolve to their own messages", async () => {
    for (const subject of ["loop A", "loop B", "thread-self-reference"]) {
      const e = named(subject);
      expect(e.threadId, subject).toBeDefined();
      const { messages } = await rpc<{ messages: { id: string }[] }>("mail.thread.get", {
        ...scope,
        threadId: e.threadId,
      });
      expect(
        messages.map((m) => m.id),
        subject,
      ).toContain(e.id);
    }
  });

  test(
    "every edge attachment lists with a filename and a size",
    async () => {
      const failed: string[] = [];
      for (const e of edge) {
        try {
          const { attachments } = await rpc<{ attachments: Attachment[] }>(
            "mail.attachments.list",
            { ...scope, id: e.id },
          );
          for (const a of attachments) {
            if (a.filename.length === 0 || a.size < 0) {
              failed.push(`${e.subject}: ${JSON.stringify(a)}`);
            }
          }
        } catch (err) {
          failed.push(`${e.subject}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      expect(failed).toEqual([]);
    },
    LONG,
  );

  test("an attachment without a filename gets a fallback name", async () => {
    const { attachments } = await rpc<{ attachments: Attachment[] }>("mail.attachments.list", {
      ...scope,
      id: named("att-no-filename").id,
    });
    expect(attachments.length).toBeGreaterThan(0);
    for (const a of attachments) expect(a.filename).toBe("attachment");
  });

  test("a zero-byte attachment downloads as empty", async () => {
    const e = named("att-zero-byte");
    const { attachments } = await rpc<{ attachments: Attachment[] }>("mail.attachments.list", {
      ...scope,
      id: e.id,
    });
    const [first] = attachments;
    expect(first).toBeDefined();
    const download = await rpc<{ data: string }>("mail.attachments.download", {
      ...scope,
      id: e.id,
      attachmentId: first?.id,
      mimeType: first?.mimeType,
    });
    expect(download.data).toBe("");
  });

  describe("message bodies in charsets other than UTF-8", () => {
    test.each([
      ["enc-gb2312-multipart", "你好，世界"],
      ["enc-shift-jis", "日本語のテキスト"],
      ["enc-iso-2022-jp", "こんにちは"],
      ["enc-cp936-label", "中文测试邮件"],
      ["enc-latin1-bytes", "Café crème à la française"],
    ])("%s reads in its own charset", async (subject, expected) => {
      const { bodyText } = await body(subject);
      expect(bodyText).toContain(expected);
      expect(bodyText).not.toContain("\u{FFFD}");
    });

    test("the html part of a multipart message reads in its own charset", async () => {
      const { bodyHtml } = await body("enc-gb2312-multipart");
      expect(bodyHtml).toContain("你好，世界");
    });

    test("UTF-8 bytes under a Latin-1 label read as UTF-8", async () => {
      const { bodyText } = await body("enc-latin1-label-utf8-bytes");
      expect(bodyText).toContain("Café — 日本語 — 🎉 labelled latin-1");
    });

    test("a charset label nobody knows still reads", async () => {
      const { bodyText } = await body("enc-bogus-charset");
      expect(bodyText).toContain("charset nobody knows");
    });

    test("Print and View original keep a raw 8-bit body in its own charset", async () => {
      const id = named("enc-cp936-label").id;

      const printed = await mailPage("print", { id });
      expect(printed.status).toBe(200);
      expect(await printed.text()).toContain("中文测试邮件");

      const original = await mailPage("original", { id, download: "1" });
      expect(original.status).toBe(200);
      const saved = Buffer.from(await original.arrayBuffer());
      expect(saved.includes(Buffer.from("d6d0cec4b2e2cad4d3cabcfe", "hex"))).toBe(true);
    });

    test("UTF-8 bytes with no charset label read as UTF-8", async () => {
      const { bodyText } = await body("enc-8bit-no-cte");
      expect(bodyText).toContain("raw 8-bit ümlaut with no transfer encoding");
    });
  });

  test("the raw source of malformed messages is returned as stored", async () => {
    for (const subject of ["garbage headers", "enc-invalid-utf8", "mime-missing-terminator"]) {
      const { raw } = await rpc<{ raw: string }>("mail.messages.getRaw", {
        ...scope,
        id: named(subject).id,
      });
      expect(raw, subject).toContain(subject);
    }
  });
});
