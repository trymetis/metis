import { expect, test } from "vitest";

import { envValue, metis, status } from "../clients/hosts";
import { env } from "../lib/env";
import { removeDomain, setDomain, trustCaddy } from "./domain";
import { actions, calls, clearCalls } from "./support/fakes";
import { output } from "./support/output";

const RESEND_DOMAIN = "cli.demo.trymetis.email";
const RESEND_HOST = "resend.cli.localhost";
const CLOUDFLARE_DOMAIN = "cf.demo.trymetis.email";
const CLOUDFLARE_WORKER = "metis-mail-cf-demo-trymetis-email";
const SES_DOMAIN = "aws.demo.trymetis.email";
const SES_NAME = "metis-ses-aws-demo-trymetis-email";
const AWS = {
  AWS_ACCESS_KEY_ID: "e2e-access-key",
  AWS_SECRET_ACCESS_KEY: "e2e-secret-key-0001",
  AWS_EC2_METADATA_DISABLED: "true",
};

async function ok(args: string[], extra: Record<string, string> = {}): Promise<string> {
  const run = await metis("cli-host", [...args, "--yes"], { env: extra });
  expect(run.code, output(run)).toBe(0);
  return output(run);
}

async function token(args: string[]): Promise<string> {
  const run = await metis("cli-host", ["gateway", "token", ...args]);
  expect(run.code, output(run)).toBe(0);
  return output(run);
}

async function containers(): Promise<string[]> {
  return (await status("cli-host")).containers.map((c) => c.name);
}

export default function gatewayTests() {
  test("add gateway-resend sets up the Resend domain and webhook and runs the gateway behind Caddy", async () => {
    await clearCalls("resend");
    await setDomain("cli.localhost");
    await trustCaddy(["cli.localhost", RESEND_HOST]);

    await ok(["add", "gateway-resend", "--domain", RESEND_DOMAIN], {
      RESEND_API_KEY: env.resend.apiKey,
    });
    expect(actions(await calls("resend"))).toEqual(
      expect.arrayContaining([
        `resend create-domain ${RESEND_DOMAIN}`,
        `resend verify-domain ${RESEND_DOMAIN}`,
        `resend create-webhook https://${RESEND_HOST}/webhooks/resend`,
      ]),
    );
    expect(await containers()).toEqual(
      expect.arrayContaining(["metis-gateway-resend", "metis-sqld-resend"]),
    );
    expect(await envValue("cli-host", "METIS_RESEND_SERVERS")).toContain(
      `"endpoint":"https://${RESEND_HOST}"`,
    );
  });

  test("gateway token creates, names, lists and revokes an address token on the server's gateway", async () => {
    const address = `hello@${RESEND_DOMAIN}`;
    const created = await token(["create", address, "--name", "Hello Desk"]);
    expect(created).toContain(`Token for ${address}`);

    expect(await token(["name", address, "Front Desk"])).toContain(
      `${address} sends as Front Desk`,
    );
    const listed = await token(["list", RESEND_DOMAIN]);
    expect(listed).toContain(address);
    expect(listed).toContain("Front Desk");

    expect(await token(["revoke", address])).toContain(`Revoked the token for ${address}`);
    expect(await token(["list", RESEND_DOMAIN])).not.toContain(address);
  });

  test("remove gateway-resend --purge deletes the webhook and the gateway's data", async () => {
    await clearCalls("resend");
    await ok(["remove", "gateway-resend", "--purge"]);
    expect(actions(await calls("resend"))).toContain(
      `resend delete-webhook https://${RESEND_HOST}/webhooks/resend`,
    );
    expect(await containers()).not.toContain("metis-gateway-resend");
    expect((await envValue("cli-host", "METIS_RESEND_SERVERS")) ?? "").not.toContain(RESEND_HOST);
    await removeDomain();
  });

  test("add gateway-cloudflare deploys the Worker with its D1, R2, routing and sending, and remove --purge takes them away", async () => {
    await clearCalls("cloudflare");
    await ok(["add", "gateway-cloudflare", "--domain", CLOUDFLARE_DOMAIN], {
      CLOUDFLARE_API_TOKEN: "e2e-cloudflare-token",
    });
    const added = await calls("cloudflare");
    expect(actions(added)).toEqual(
      expect.arrayContaining([
        `d1 create ${CLOUDFLARE_WORKER}`,
        `d1 query ${CLOUDFLARE_WORKER}`,
        `r2 create ${CLOUDFLARE_WORKER}-raw`,
        `workers upload ${CLOUDFLARE_WORKER}`,
        `workers subdomain ${CLOUDFLARE_WORKER}`,
        `email-routing enable ${CLOUDFLARE_DOMAIN}`,
        `email-routing catch-all ${CLOUDFLARE_DOMAIN}`,
        `email-sending enable ${CLOUDFLARE_DOMAIN}`,
      ]),
    );
    const upload = added.find((call) => call.action === "upload");
    expect(upload?.detail).toMatchObject({
      main_module: "index.js",
      files: "index.js,index.js.map",
      bindings: "DB,RAW,EMAIL,MAIL_DOMAIN,API_TOKEN",
    });
    expect(added.find((call) => call.action === "catch-all")?.detail).toMatchObject({
      enabled: "true",
      workers: CLOUDFLARE_WORKER,
    });
    expect(await envValue("cli-host", "METIS_CLOUDFLARE_SERVERS")).toContain(
      `"endpoint":"https://${CLOUDFLARE_WORKER}.metis-e2e.workers.dev"`,
    );

    await clearCalls("cloudflare");
    await ok(["remove", "gateway-cloudflare", "--domain", CLOUDFLARE_DOMAIN, "--purge"], {
      CLOUDFLARE_API_TOKEN: "e2e-cloudflare-token",
    });
    const removed = await calls("cloudflare");
    expect(actions(removed)).toEqual(
      expect.arrayContaining([
        `email-routing catch-all ${CLOUDFLARE_DOMAIN}`,
        `workers delete ${CLOUDFLARE_WORKER}`,
        `d1 delete ${CLOUDFLARE_WORKER}`,
        `r2 delete ${CLOUDFLARE_WORKER}-raw`,
      ]),
    );
    expect(removed.find((call) => call.action === "catch-all")?.detail).toMatchObject({
      enabled: "false",
    });
    expect((await envValue("cli-host", "METIS_CLOUDFLARE_SERVERS")) ?? "").not.toContain(
      CLOUDFLARE_WORKER,
    );
  });

  test("add gateway-ses deploys the bucket, queue, role, function, URL and receipt rule, and remove --purge takes them away", async () => {
    await clearCalls("ses");
    await ok(
      [
        "add",
        "gateway-ses",
        "--domain",
        SES_DOMAIN,
        "--region",
        "us-east-1",
        "--database-url",
        "http://ses.sqld-external:8080",
        "--database-token",
        env.ses.databaseToken,
      ],
      AWS,
    );
    const added = await calls("ses");
    expect(actions(added)).toEqual(
      expect.arrayContaining([
        `sesv2 CreateEmailIdentity ${SES_DOMAIN}`,
        `s3 CreateBucket ${SES_NAME}`,
        `s3 PutBucketPolicy ${SES_NAME}`,
        `sqs CreateQueue ${SES_NAME}-failed`,
        `iam CreateRole ${SES_NAME}`,
        `iam PutRolePolicy ${SES_NAME}`,
        `lambda CreateFunction ${SES_NAME}`,
        `lambda CreateFunctionUrlConfig ${SES_NAME}`,
        `lambda PutFunctionEventInvokeConfig ${SES_NAME}`,
        "ses CreateReceiptRuleSet metis",
        "ses SetActiveReceiptRuleSet metis",
        `ses CreateReceiptRule ${SES_NAME}`,
      ]),
    );
    expect(added.find((call) => call.action === "CreateFunction")?.detail).toMatchObject({
      environment: "API_TOKEN,DATABASE_AUTH_TOKEN,DATABASE_URL,MAIL_BUCKET,MAIL_DOMAIN",
    });
    expect(added.find((call) => call.action === "CreateReceiptRule")?.detail).toMatchObject({
      ruleSet: "metis",
      recipient: SES_DOMAIN,
      bucket: SES_NAME,
    });
    expect(await envValue("cli-host", "METIS_SES_SERVERS")).toContain(`"id":"${SES_NAME}"`);

    await clearCalls("ses");
    await ok(["remove", "gateway-ses", "--domain", SES_DOMAIN, "--purge"], AWS);
    expect(actions(await calls("ses"))).toEqual(
      expect.arrayContaining([
        `ses DeleteReceiptRule ${SES_NAME}`,
        `lambda DeleteFunctionUrlConfig ${SES_NAME}`,
        `lambda DeleteFunction ${SES_NAME}`,
        `sqs DeleteQueue ${SES_NAME}-failed`,
        `iam DeleteRole ${SES_NAME}`,
        `s3 DeleteBucket ${SES_NAME}`,
      ]),
    );
    expect((await envValue("cli-host", "METIS_SES_SERVERS")) ?? "").not.toContain(SES_NAME);
  });
}
