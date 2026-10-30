import { Readable } from "node:stream";

import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@metis/e2e/lib/env";
import { Client as FtpClient } from "basic-ftp";
import { ImapFlow } from "imapflow";
import SftpClient from "ssh2-sftp-client";
import { describe, expect, test } from "vitest";

import type { Account } from "../../clients/harness";
import type { Rpc } from "../../clients/rpc";
import { uniqueName, until } from "../support/poll";
import { ana, scope } from "../support/session";
import { at, edge, getRun, type GraphNode, graphOf, lit, node } from "../support/workflow";

const FEED_TIMEOUT = 3 * 60_000;

interface DirectoryEntry {
  id: string;
  slug: string;
  email: string;
}

interface Directory {
  mailboxes: DirectoryEntry[];
  calendars: DirectoryEntry[];
  drives: DirectoryEntry[];
}

async function directory(rpc: Rpc, account: Account): Promise<Directory> {
  return (await rpc<{ directory: Directory }>("workflows.list", scope(account))).directory;
}

function bySlug(entries: DirectoryEntry[], slug: string): string {
  const found = entries.find((entry) => entry.slug === slug);
  if (!found) throw new Error(`nothing in the workflow directory has the slug ${slug}`);
  return found.id;
}

async function withFeed(
  rpc: Rpc,
  account: Account,
  trigger: GraphNode,
  run: (workflowId: string) => Promise<void>,
): Promise<void> {
  const graph = graphOf(
    [
      trigger,
      node("seen", "logic.set", at(1), {
        fields: lit([{ name: "event", value: { kind: "expr", cel: "item" } }]),
      }),
    ],
    [edge(trigger.id, "seen")],
  );
  const { workflow } = await rpc<{ workflow: { id: string } }>("workflows.create", {
    ...scope(account),
    workflow: { name: uniqueName(), enabled: true, graph },
  });
  try {
    await until(
      async () => {
        const { workflows } = await rpc<{
          workflows: { id: string; sources: { baselined: boolean; error: string | null }[] }[];
        }>("workflows.list", scope(account));
        return workflows.find((w) => w.id === workflow.id)?.sources ?? [];
      },
      (sources) => sources.length > 0 && sources.every((s) => s.baselined),
      { timeout: FEED_TIMEOUT, what: "the feed to baseline" },
    );
    await run(workflow.id);
  } finally {
    await rpc("workflows.delete", { ...scope(account), id: workflow.id });
  }
}

async function firedFor(
  rpc: Rpc,
  account: Account,
  workflowId: string,
  matches: (event: Record<string, unknown>) => boolean,
): Promise<string> {
  let found: string | null = null;
  await until(
    async () => {
      const { runs } = await rpc<{ runs: { id: string }[] }>("workflows.runs", {
        ...scope(account),
        workflowId,
        limit: 20,
      });
      for (const listed of runs) {
        const run = await rpc<{ run: { trigger: { event: unknown } } }>("workflows.getRun", {
          ...scope(account),
          runId: listed.id,
        });
        const event = run.run.trigger.event;
        if (
          event &&
          typeof event === "object" &&
          matches(Object.fromEntries(Object.entries(event)))
        ) {
          found = listed.id;
        }
      }
      return found;
    },
    (id) => id !== null,
    { timeout: FEED_TIMEOUT, interval: 3_000, what: "a run for the new item" },
  );
  if (!found) throw new Error("no run fired");
  return found;
}

async function withImap<T>(run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: false,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.logout();
  }
}

test(
  "an IMAP folder's new message starts a run through the change cursor",
  async () => {
    const { rpc, account } = await ana();
    const mailboxId = bySlug((await directory(rpc, account)).mailboxes, account.mailboxSlug);
    const subject = uniqueName();
    await withFeed(
      rpc,
      account,
      node("arrives", "trigger.mail.received", at(0), {
        mailbox: lit(mailboxId),
        folder: lit("spam"),
      }),
      async (workflowId) => {
        try {
          await withImap((client) =>
            client.append(
              "Junk",
              `From: feeds@demo.trymetis.email\r\nTo: ${env.imap.user}\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\n\r\nA message for the change feed.\r\n`,
            ),
          );
          const runId = await firedFor(rpc, account, workflowId, (e) => e.subject === subject);
          const run = await until(
            () => getRun(rpc, account, runId),
            (r) => r.finishedAt !== null,
            { what: "the run to finish" },
          );
          expect(run.status).toBe("completed");
        } finally {
          await withImap(async (client) => {
            const lock = await client.getMailboxLock("Junk");
            try {
              const found = await client.search({ subject }, { uid: true });
              if (found && found.length > 0) {
                await client.messageDelete(found, { uid: true });
              }
            } finally {
              lock.release();
            }
          });
        }
      },
    );
  },
  2 * FEED_TIMEOUT,
);

function dav(path: string, method: string, body?: string): Promise<Response> {
  return fetch(`${env.servers.caldavOrigin}${path}`, {
    method,
    headers: {
      authorization: `Basic ${btoa(`${env.caldav.user}:${env.caldav.pass}`)}`,
      "content-type": "text/calendar; charset=utf-8",
    },
    body,
  });
}

function icsStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

test(
  "a CalDAV event added outside the app starts a run",
  async () => {
    const { rpc, account } = await ana();
    const calendarId = bySlug((await directory(rpc, account)).calendars, account.calendarSlug);
    const title = uniqueName();
    const uid = `${title}@demo.trymetis.email`;
    const path = `/${env.caldav.user}/work/${title}.ics`;
    const start = new Date(Date.now() + 2 * 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    await withFeed(
      rpc,
      account,
      node("created", "trigger.calendar.created", at(0), { calendar: lit(calendarId) }),
      async (workflowId) => {
        try {
          const put = await dav(
            path,
            "PUT",
            [
              "BEGIN:VCALENDAR",
              "VERSION:2.0",
              "PRODID:-//metis-e2e//feeds//EN",
              "BEGIN:VEVENT",
              `UID:${uid}`,
              `DTSTAMP:${icsStamp(new Date())}`,
              `DTSTART:${icsStamp(start)}`,
              `DTEND:${icsStamp(end)}`,
              `SUMMARY:${title}`,
              "END:VEVENT",
              "END:VCALENDAR",
              "",
            ].join("\r\n"),
          );
          expect(put.ok).toBe(true);
          const runId = await firedFor(rpc, account, workflowId, (e) => e.title === title);
          expect(runId).toBeTruthy();
        } finally {
          await dav(path, "DELETE");
        }
      },
    );
  },
  2 * FEED_TIMEOUT,
);

interface FolderWriter {
  makeFolder(folder: string): Promise<void>;
  put(path: string, body: Buffer): Promise<void>;
  remove(folder: string, path: string): Promise<void>;
}

async function withS3<T>(run: (writer: FolderWriter) => Promise<T>): Promise<T> {
  const s3 = new S3Client({
    endpoint: env.s3.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  const Bucket = env.s3.bucket;
  try {
    return await run({
      async makeFolder(folder) {
        await s3.send(new PutObjectCommand({ Bucket, Key: `${folder}/`, Body: "" }));
      },
      async put(path, body) {
        await s3.send(new PutObjectCommand({ Bucket, Key: path, Body: body }));
      },
      async remove(folder, path) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: [{ Key: path }, { Key: `${folder}/` }] },
          }),
        );
      },
    });
  } finally {
    s3.destroy();
  }
}

async function withFtp<T>(run: (writer: FolderWriter) => Promise<T>): Promise<T> {
  const client = new FtpClient(30_000);
  await client.access({
    host: env.ftp.host,
    port: env.ftp.port,
    user: env.ftp.user,
    password: env.ftp.pass,
  });
  try {
    return await run({
      async makeFolder(folder) {
        await client.ensureDir(`/${folder}`);
        await client.cd("/");
      },
      async put(path, body) {
        await client.uploadFrom(Readable.from([body]), `/${path}`);
      },
      async remove(folder, path) {
        await client.remove(`/${path}`).catch(() => {});
        await client.removeDir(`/${folder}`).catch(() => {});
      },
    });
  } finally {
    client.close();
  }
}

async function withSftp<T>(run: (writer: FolderWriter) => Promise<T>): Promise<T> {
  const client = new SftpClient("e2e-feeds");
  await client.connect({
    host: env.sftp.host,
    port: env.sftp.port,
    username: env.sftp.user,
    password: env.sftp.pass,
  });
  const root = `${await client.cwd()}/${env.sftp.root.replace(/^\/+|\/+$/g, "")}`;
  try {
    return await run({
      async makeFolder(folder) {
        await client.mkdir(`${root}/${folder}`, true);
      },
      async put(path, body) {
        await client.put(body, `${root}/${path}`);
      },
      async remove(folder, path) {
        await client.delete(`${root}/${path}`, true);
        await client.rmdir(`${root}/${folder}`, true).catch(() => {});
      },
    });
  } finally {
    await client.end();
  }
}

type Writer = <T>(run: (writer: FolderWriter) => Promise<T>) => Promise<T>;

async function driveFeed(provider: string, write: Writer, base = ""): Promise<string> {
  const { rpc, account } = await ana();
  const driveSlug = account.driveSlugs[provider];
  if (!driveSlug) throw new Error(`no ${provider} drive is enrolled`);
  const driveId = bySlug((await directory(rpc, account)).drives, driveSlug);
  const folder = base ? `${base}/${uniqueName()}` : uniqueName();
  const name = `${uniqueName()}.txt`;
  let fired = "";
  await write(async (writer) => {
    await writer.makeFolder(folder);
    try {
      await withFeed(
        rpc,
        account,
        node("added", "trigger.drive.added", at(0), { drive: lit(driveId), folder: lit(folder) }),
        async (workflowId) => {
          await writer.put(`${folder}/${name}`, Buffer.from("a file for the change feed"));
          fired = await firedFor(rpc, account, workflowId, (e) => e.name === name);
        },
      );
    } finally {
      await writer.remove(folder, `${folder}/${name}`);
    }
  });
  return fired;
}

describe("a file added outside the app starts a run", () => {
  test("on S3", async () => expect(await driveFeed("s3", withS3)).toBeTruthy(), 2 * FEED_TIMEOUT);
  test(
    "on FTP",
    async () => expect(await driveFeed("ftp", withFtp, "Clients")).toBeTruthy(),
    2 * FEED_TIMEOUT,
  );
  test(
    "on SFTP",
    async () => expect(await driveFeed("sftp", withSftp)).toBeTruthy(),
    2 * FEED_TIMEOUT,
  );
});
