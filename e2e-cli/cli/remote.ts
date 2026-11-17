import { beforeAll, expect, test } from "vitest";

import { fresh, metis, readFile, shell } from "../clients/hosts";
import { env } from "../lib/env";
import { releases } from "../lib/releases";
import { actions, calls, clearCalls } from "./support/fakes";
import { output } from "./support/output";
import { installCliOnly } from "./support/remote";

const CLOUDFLARE_DOMAIN = "cf.demo.trymetis.email";
const CLOUDFLARE_WORKER = "metis-mail-cf-demo-trymetis-email";
const SES_DOMAIN = "aws.demo.trymetis.email";
const SES_NAME = "metis-ses-aws-demo-trymetis-email";
const RESEND_DOMAIN = "remote.demo.trymetis.email";
const RESEND_ENDPOINT = "https://resend-gateway.remote.example";
const GATEWAY = "http://gateway-resend:8787";
const AWS = {
  AWS_ACCESS_KEY_ID: "e2e-access-key",
  AWS_SECRET_ACCESS_KEY: "e2e-secret-key-0001",
  AWS_EC2_METADATA_DISABLED: "true",
};
const ADMIN_TOKEN_LINE =
  "The gateway's admin token (API_TOKEN), shown once; metis gateway token needs it:";

async function ok(args: string[], extra: Record<string, string> = {}): Promise<string> {
  const run = await metis("cli-host", args, { env: extra });
  expect(run.code, output(run)).toBe(0);
  return output(run);
}

export default function remoteTests() {
  const r = releases();

  beforeAll(async () => {
    await fresh("cli-host");
    await installCliOnly();
  });

  test("with no install on the machine, metis version prints this CLI's version", async () => {
    const run = await metis("cli-host", ["version"]);
    expect(run.code, output(run)).toBe(0);
    expect(output(run)).toContain(r.cli);
  });

  test("server commands stop with no install here", async () => {
    for (const args of [["status"], ["update"], ["add", "worker"], ["apply"]]) {
      const run = await metis("cli-host", args);
      expect(run.code, args.join(" ")).not.toBe(0);
      expect(output(run), args.join(" ")).toContain("This machine has no Metis install");
    }
  });

  test("sqld-auth prints a JWT key and its token", async () => {
    const run = await metis("cli-host", ["sqld-auth"]);
    expect(run.code, output(run)).toBe(0);
    expect(run.stdout).toMatch(
      /^SQLD_AUTH_JWT_KEY=\S+\nDATABASE_AUTH_TOKEN=\S+\nMASTRA_DATABASE_AUTH_TOKEN=\S+\n$/,
    );
  });

  test("config set --env-file updates the file and lists what to set on the platform", async () => {
    await shell("cli-host", "printf 'TZ=UTC\\n' > /root/platform.env", { check: true });
    const boot = await metis("cli-host", [
      "config",
      "set",
      "--env-file",
      "/root/platform.env",
      "METIS_E2E_MARKER=on",
    ]);
    expect(boot.code, output(boot)).toBe(0);
    expect(output(boot)).toContain("Set these on the platform that runs Metis:");
    expect(output(boot)).toContain("METIS_E2E_MARKER=on");
    expect(await readFile("cli-host", "/root/platform.env")).toContain("METIS_E2E_MARKER=on");

    const dashboard = await metis("cli-host", [
      "config",
      "set",
      "--env-file",
      "/root/platform.env",
      "METIS_DRIVE_RELAY_MAX_MB=64",
    ]);
    expect(dashboard.code).not.toBe(0);
    expect(output(dashboard)).toContain(
      "METIS_DRIVE_RELAY_MAX_MB are dashboard settings; pass --version X.Y.Z",
    );
  });

  test("add and remove gateway-cloudflare --remote work on the Cloudflare account and print the server entry", async () => {
    await clearCalls("cloudflare");
    const cloudflare = { CLOUDFLARE_API_TOKEN: "e2e-cloudflare-token" };
    const added = await ok(
      ["add", "gateway-cloudflare", "--remote", "--domain", CLOUDFLARE_DOMAIN, "--yes"],
      cloudflare,
    );
    expect(added).toContain(ADMIN_TOKEN_LINE);
    expect(added).toContain('METIS_CLOUDFLARE_SERVERS=[{"');
    expect(added).toContain(`https://${CLOUDFLARE_WORKER}.metis-e2e.workers.dev`);
    expect(actions(await calls("cloudflare"))).toEqual(
      expect.arrayContaining([
        `d1 create ${CLOUDFLARE_WORKER}`,
        `workers upload ${CLOUDFLARE_WORKER}`,
        `email-routing catch-all ${CLOUDFLARE_DOMAIN}`,
      ]),
    );

    await clearCalls("cloudflare");
    const removed = await ok(
      [
        "remove",
        "gateway-cloudflare",
        "--remote",
        "--domain",
        CLOUDFLARE_DOMAIN,
        "--purge",
        "--yes",
      ],
      cloudflare,
    );
    expect(removed).toContain(
      "Remove the server metis-cloudflare-cf-demo-trymetis-email from Dashboard → System",
    );
    expect(actions(await calls("cloudflare"))).toEqual(
      expect.arrayContaining([
        `workers delete ${CLOUDFLARE_WORKER}`,
        `d1 delete ${CLOUDFLARE_WORKER}`,
        `r2 delete ${CLOUDFLARE_WORKER}-raw`,
      ]),
    );
  });

  test("add and remove gateway-ses --remote work on the AWS account and print the server entry", async () => {
    await clearCalls("ses");
    const added = await ok(
      [
        "add",
        "gateway-ses",
        "--remote",
        "--domain",
        SES_DOMAIN,
        "--region",
        "us-east-1",
        "--database-url",
        "http://ses.sqld-external:8080",
        "--database-token",
        env.ses.databaseToken,
        "--yes",
      ],
      AWS,
    );
    expect(added).toContain(ADMIN_TOKEN_LINE);
    expect(added).toContain('METIS_SES_SERVERS=[{"');
    expect(added).toContain(`"id":"${SES_NAME}"`);
    expect(actions(await calls("ses"))).toEqual(
      expect.arrayContaining([
        `s3 CreateBucket ${SES_NAME}`,
        `lambda CreateFunction ${SES_NAME}`,
        `ses CreateReceiptRule ${SES_NAME}`,
      ]),
    );

    await clearCalls("ses");
    const removed = await ok(
      [
        "remove",
        "gateway-ses",
        "--remote",
        "--domain",
        SES_DOMAIN,
        "--region",
        "us-east-1",
        "--purge",
        "--yes",
      ],
      AWS,
    );
    expect(removed).toContain(`Remove the server ${SES_NAME} from Dashboard → System`);
    expect(actions(await calls("ses"))).toEqual(
      expect.arrayContaining([
        `ses DeleteReceiptRule ${SES_NAME}`,
        `lambda DeleteFunction ${SES_NAME}`,
        `s3 DeleteBucket ${SES_NAME}`,
      ]),
    );
  });

  test("add and remove gateway-resend --endpoint do the Resend side for a gateway that runs elsewhere", async () => {
    await clearCalls("resend");
    const resend = { RESEND_API_KEY: env.resend.apiKey };
    const added = await ok(
      ["add", "gateway-resend", "--domain", RESEND_DOMAIN, "--endpoint", RESEND_ENDPOINT, "--yes"],
      resend,
    );
    expect(added).toContain(`Set these on the gateway at ${RESEND_ENDPOINT}:`);
    expect(added).toContain(`MAIL_DOMAIN=${RESEND_DOMAIN}`);
    expect(added).toMatch(/RESEND_WEBHOOK_SECRET=\S+/);
    expect(added).toContain('METIS_RESEND_SERVERS=[{"');
    expect(added).toContain(`"endpoint":"${RESEND_ENDPOINT}"`);
    expect(actions(await calls("resend"))).toEqual(
      expect.arrayContaining([
        `resend create-domain ${RESEND_DOMAIN}`,
        `resend create-webhook ${RESEND_ENDPOINT}/webhooks/resend`,
      ]),
    );

    await clearCalls("resend");
    const removed = await ok(
      [
        "remove",
        "gateway-resend",
        "--domain",
        RESEND_DOMAIN,
        "--endpoint",
        RESEND_ENDPOINT,
        "--yes",
      ],
      resend,
    );
    expect(removed).toContain(`Deleted 1 Resend webhook(s) to ${RESEND_ENDPOINT}`);
    expect(actions(await calls("resend"))).toContain(
      `resend delete-webhook ${RESEND_ENDPOINT}/webhooks/resend`,
    );
  });

  test("gateway token --endpoint creates, names, lists and revokes a token on a gateway that runs elsewhere", async () => {
    const address = `cli-remote@${env.resend.domain}`;
    const access = ["--endpoint", GATEWAY, "--admin-token", env.resend.adminToken];
    const token = (args: string[]) => ok(["gateway", "token", ...args, ...access]);

    expect(await token(["create", address, "--name", "Remote Desk"])).toContain(
      `Token for ${address}`,
    );
    expect(await token(["name", address, "Front Desk"])).toContain(
      `${address} sends as Front Desk`,
    );
    const listed = await token(["list", env.resend.domain]);
    expect(listed).toContain(address);
    expect(listed).toContain("Front Desk");
    expect(await token(["revoke", address])).toContain(`Revoked the token for ${address}`);
    expect(await token(["list", env.resend.domain])).not.toContain(address);

    const missing = await metis("cli-host", ["gateway", "token", "list", env.resend.domain]);
    expect(missing.code).not.toBe(0);
    expect(output(missing)).toContain("Away from the server, pass --endpoint and --admin-token");
  });
}
