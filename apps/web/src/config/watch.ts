import "server-only";
import { retireFtpServers } from "@/drive/providers/ftp/pool";
import { retireSftpServers } from "@/drive/providers/sftp/client";
import { imapSettingsKey, retireImapServers } from "@/mail/providers/imap-pool";
import { warmupCache } from "@/services/cache";
import { warnIfMailUndelivered } from "@/services/mailer";

import { type InstanceConfigChange, onInstanceConfigChange } from "./runtime";
import type { InstanceConfig, InstanceSection } from "./schema";
import { hashSection } from "./sections";

const CONNECTION_SECTIONS = new Set<InstanceSection>([
  "google",
  "microsoft",
  "zoho",
  "imapServers",
  "caldavServers",
  "carddavServers",
  "cloudflareServers",
  "resendServers",
  "s3Servers",
  "webdavServers",
  "ftpServers",
  "sftpServers",
]);

function touches(
  change: InstanceConfigChange,
  sections: Set<InstanceSection> | InstanceSection,
): boolean {
  return change.sections.some((section) =>
    typeof sections === "string" ? section === sections : sections.has(section),
  );
}

function entryVersions(entries: { id: string }[]): Map<string, string> {
  return new Map(entries.map((entry) => [entry.id, hashSection(entry)]));
}

function retireChangedPools(instance: InstanceConfig, previous: InstanceConfig): void {
  const ftp = entryVersions(instance.ftpServers);
  const ftpBefore = entryVersions(previous.ftpServers);
  retireFtpServers((id) => ftp.has(id) && ftp.get(id) === ftpBefore.get(id));

  const sftp = entryVersions(instance.sftpServers);
  const sftpBefore = entryVersions(previous.sftpServers);
  retireSftpServers((id) => sftp.has(id) && sftp.get(id) === sftpBefore.get(id));

  retireImapServers(
    new Map(instance.imapServers.map((server) => [server.id, imapSettingsKey(server)])),
  );
}

export function watchInstanceConfig(opts: { onRunnerChange?: () => Promise<void> }): void {
  onInstanceConfigChange(async (change) => {
    const step = async (label: string, run: () => unknown) => {
      try {
        await run();
      } catch (err) {
        console.error(`[config] ${label} after version ${change.version} failed`, err);
      }
    };

    if (touches(change, "mailer")) {
      await step("mail warning", warnIfMailUndelivered);
    }
    if (touches(change, "cache")) await step("cache warmup", warmupCache);
    if (touches(change, CONNECTION_SECTIONS)) {
      await step("closing changed server pools", () =>
        retireChangedPools(change.config, change.previous),
      );
    }
    const { onRunnerChange } = opts;
    if (touches(change, "workflowRunner") && onRunnerChange) {
      await step("runner switch", onRunnerChange);
    }
  });
}
