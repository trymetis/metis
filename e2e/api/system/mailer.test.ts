import { consoleMailHitsSchema } from "@metis/e2e/lib/console-mail";
import { env } from "@metis/e2e/lib/env";
import { ImapFlow } from "imapflow";
import { expect, test } from "vitest";
import { z } from "zod";

import { HARNESS, harness } from "../../clients/harness";
import type { Rpc } from "../../clients/rpc";
import { allOk, checkDriver, setSection } from "../support/config";
import { uniqueName, until } from "../support/poll";
import { ana } from "../support/session";

const QUIET_MS = 3_000;

async function systemMailbox(address: string): Promise<string | null> {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: false,
    auth: { user: env.systemMail.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ to: address }, { uid: true });
      const uid = uids ? uids.at(-1) : undefined;
      if (uid === undefined) return null;
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      return message ? (message.source?.toString("utf8") ?? null) : null;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function consoleMail(address: string) {
  const res = await fetch(`${HARNESS}/console-mail-hits`);
  const hits = consoleMailHitsSchema.parse(await res.json());
  return hits.find((hit) => hit.to === address);
}

async function resendMail(address: string) {
  const res = await fetch(`${env.resend.controlUrl}/sent`);
  const sent = z
    .array(z.object({ to: z.array(z.string()), text: z.string().nullable() }))
    .parse(await res.json());
  return sent.find((mail) => mail.to.includes(address));
}

async function invite(rpc: Rpc, workspaceSlug: string, address: string): Promise<string> {
  const { url } = await rpc<{ url: string }>("workspaces.createInvite", {
    workspaceSlug,
    email: address,
  });
  return url;
}

async function nowhere(address: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, QUIET_MS));
  expect(await consoleMail(address), "console").toBeUndefined();
  expect(await resendMail(address), "resend").toBeUndefined();
  expect(await systemMailbox(address), "smtp").toBeNull();
}

test(
  "the mailer moves from log to smtp, console, resend and noop and back to log, and mail lands only where the driver sends it",
  async () => {
    const { rpc } = await ana();
    const name = uniqueName();
    const address = (driver: string) => `${name}-${driver}@${env.systemMail.domain}`;
    const workspace = await rpc<{ slug: string }>("workspaces.create", {
      name,
    });
    try {
      await setSection(rpc, "mailer", {
        driver: "smtp",
        mailFrom: "Metis Suite <noreply@notify.demo.trymetis.email>",
        host: env.imap.host,
        port: env.imap.smtpPort,
        user: env.imap.user,
        pass: env.imap.pass,
        secure: false,
      });
      allOk(await checkDriver(rpc, "mail"));
      const smtpUrl = await invite(rpc, workspace.slug, address("smtp"));
      const delivered = await until(
        () => systemMailbox(address("smtp")),
        (source) => source !== null,
        { timeout: 60_000, interval: 2_000, what: "the invite over smtp" },
      );
      expect(delivered?.replace(/=\r?\n/g, "")).toContain(
        new URL(smtpUrl).searchParams.get("token"),
      );

      await setSection(rpc, "mailer", {
        driver: "console",
        endpoint: env.consoleMail.url,
        token: env.consoleMail.token,
      });
      const consoleUrl = await invite(rpc, workspace.slug, address("console"));
      const posted = await until(
        () => consoleMail(address("console")),
        (hit) => hit !== undefined,
        { timeout: 30_000, what: "the invite at the console endpoint" },
      );
      expect(posted?.text).toContain(consoleUrl);

      await setSection(rpc, "mailer", {
        driver: "resend",
        apiKey: env.resend.apiKey,
        mailFrom: `Metis Suite <noreply@${env.resend.domain}>`,
      });
      allOk(await checkDriver(rpc, "mail"));
      const resendUrl = await invite(rpc, workspace.slug, address("resend"));
      const sent = await until(
        () => resendMail(address("resend")),
        (mail) => mail !== undefined,
        { timeout: 30_000, what: "the invite at Resend" },
      );
      expect(sent?.text).toContain(resendUrl);

      await setSection(rpc, "mailer", { driver: "noop" });
      await invite(rpc, workspace.slug, address("noop"));
      await nowhere(address("noop"));

      await setSection(rpc, "mailer", { driver: "log" });
      await invite(rpc, workspace.slug, address("log"));
      await nowhere(address("log"));
    } finally {
      try {
        const { driver } = await rpc<{ driver: string }>("dashboard.system.mail");
        if (driver !== "log") await setSection(rpc, "mailer", { driver: "log" });
      } finally {
        await rpc("workspaces.delete", {
          workspaceSlug: workspace.slug,
          code: await harness.totp(),
        });
      }
    }
  },
  15 * 60_000,
);
