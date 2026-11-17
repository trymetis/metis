import { harness } from "@metis/e2e/clients/harness";
import { expect, test } from "vitest";

import { APP, metis, shell, waitReady } from "../clients/hosts";
import { releases } from "../lib/releases";
import { output } from "./support/output";

export const ARCHIVE = "/root/stack-export.tar";
export const IDENTITY = "/root/stack.key";

export default function exportTests() {
  const r = releases();

  test("keygen, then db export on the server encrypted to that key", async () => {
    await shell("cli-host", "rm -f /root/stack.key /root/stack.pub /root/stack-export.tar", {
      check: true,
    });
    const keygen = await metis("cli-host", ["keygen", "--out", "/root/stack"]);
    expect(keygen.code, output(keygen)).toBe(0);

    const exported = await metis("cli-host", ["db", "export", "--recipient", "/root/stack.pub"]);
    expect(exported.code, output(exported)).toBe(0);
    await waitReady(APP);
    const listed = await shell("cli-host", "ls -t /opt/metis-suite/exports/ | head -1", {
      check: true,
    });
    const archive = listed.stdout.trim();
    expect(archive).toMatch(/^metis-export-\d{8}T\d{6}Z\.tar$/);
    await shell("cli-host", `cp /opt/metis-suite/exports/${archive} ${ARCHIVE}`, { check: true });
  });

  test("export inspect checks the archive without a key, and decrypt opens it with sqlite3", async () => {
    const inspected = await metis("cli-host", ["export", "inspect", ARCHIVE]);
    expect(inspected.code, output(inspected)).toBe(0);
    expect(output(inspected)).toContain(r.current);

    const decrypted = await metis("cli-host", [
      "export",
      "decrypt",
      ARCHIVE,
      "--identity",
      IDENTITY,
      "--out",
      "/root/plain",
    ]);
    expect(decrypted.code, output(decrypted)).toBe(0);
    const account = await harness.account();
    const users = await shell(
      "cli-host",
      [
        'for db in $(find /root/plain -type f -name "*.sqlite"); do',
        '  sqlite3 "$db" "SELECT email FROM user" 2> /dev/null || true',
        "done",
      ].join("\n"),
    );
    expect(users.stdout).toContain(account.email);
  });
}
