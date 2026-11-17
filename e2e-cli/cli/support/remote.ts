import { shell } from "@metis/e2e-cli/clients/hosts";
import { releases } from "@metis/e2e-cli/lib/releases";

export async function installCliOnly(version = releases().cli): Promise<void> {
  await shell(
    "cli-host",
    [
      "set -euo pipefail",
      'case "$(uname -m)" in x86_64|amd64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; esac',
      `curl -fsSL "https://sh.trymetis.email/cli/v${version}/metis-linux-$arch" -o /usr/local/bin/metis`,
      "chmod 0755 /usr/local/bin/metis",
    ].join("\n"),
    { check: true },
  );
}
