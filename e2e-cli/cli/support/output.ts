import type { Run } from "@metis/e2e-cli/clients/hosts";

export function output(run: Run): string {
  return `${run.stdout}\n${run.stderr}`;
}
