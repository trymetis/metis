import * as OTPAuth from "otpauth";
import { expect, test } from "vitest";
import { z } from "zod";

import { APP } from "../../clients/harness";
import { ana, totpCode } from "../support/session";

const RETRY_FALLBACK_SEC = 60;
const FAKE_PASSKEY_PROOF = `proof-${"A".repeat(40)}`;

const methodsSchema = z.object({
  methods: z.array(z.enum(["totp", "passkey"])),
  preferred: z.enum(["totp", "passkey"]),
  passkeys: z.array(z.object({ id: z.string(), name: z.string() })),
});

const errorSchema = z.object({ code: z.string().optional(), message: z.string().optional() });

async function auth(
  path: string,
  init: {
    method?: "GET" | "POST";
    cookie?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const send = () =>
    fetch(`${APP}/api/auth${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        origin: APP,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  let res = await send();
  while (res.status === 429) {
    const wait = Number(res.headers.get("x-retry-after") ?? RETRY_FALLBACK_SEC);
    await new Promise((done) => setTimeout(done, (wait + 1) * 1000));
    res = await send();
  }
  return { status: res.status, body: await res.json().catch(() => null), res };
}

function errorCode(body: unknown): string | undefined {
  return errorSchema.parse(body).code;
}

test("a signed-in account lists its second factors with the authenticator as the default", async () => {
  const { cookie } = await ana();
  const listed = await auth("/two-factor/methods", { cookie });
  expect(listed.status).toBe(200);
  expect(methodsSchema.parse(listed.body)).toEqual({
    methods: ["totp"],
    preferred: "totp",
    passkeys: [],
  });
});

test("the default can't be set to a method the account doesn't have", async () => {
  const { cookie } = await ana();
  const refused = await auth("/two-factor/preferences", {
    cookie,
    body: { preferred: "passkey" },
  });
  expect(refused.status).toBe(400);
  expect(errorCode(refused.body)).toBe("METHOD_NOT_AVAILABLE");
});

test("adding a passkey once two-factor is on needs a second factor first", async () => {
  const { cookie, account } = await ana();
  const refused = await auth("/two-factor/enroll", { cookie, body: { method: "passkey" } });
  expect(refused.status).toBe(400);
  expect(errorCode(refused.body)).toBe("SECOND_FACTOR_REQUIRED");

  const started = await auth("/two-factor/enroll", {
    cookie,
    body: { method: "passkey", code: totpCode(account.totpURI) },
  });
  expect(started.status).toBe(200);
  const parsed = z
    .object({
      method: z.literal("passkey"),
      backupCodes: z.null(),
      options: z.object({ challenge: z.string().min(16), rp: z.object({ id: z.string() }) }),
    })
    .parse(started.body);
  expect(parsed.options.rp.id).toBe(new URL(APP).hostname);
});

test("the authenticator QR code and authenticator setup take the account password, never a second factor", async () => {
  const { cookie, account } = await ana();
  const code = totpCode(account.totpURI);

  const qrWithCode = await auth("/two-factor/totp-uri", {
    cookie,
    body: { password: "not-the-password", code },
  });
  expect(qrWithCode.status).toBe(400);
  expect(errorCode(qrWithCode.body)).toBe("INVALID_PASSWORD");
  const qr = await auth("/two-factor/totp-uri", { cookie, body: { password: account.password } });
  expect(qr.status).toBe(200);
  const shown = z.object({ totpURI: z.string() }).parse(qr.body);
  expect(OTPAuth.URI.parse(shown.totpURI).secret.base32).toBe(
    OTPAuth.URI.parse(account.totpURI).secret.base32,
  );

  const setupWithCode = await auth("/two-factor/enroll", {
    cookie,
    body: { method: "totp", password: "not-the-password", code },
  });
  expect(setupWithCode.status).toBe(400);
  expect(errorCode(setupWithCode.body)).toBe("INVALID_PASSWORD");
  const setup = await auth("/two-factor/enroll", {
    cookie,
    body: { method: "totp", password: account.password },
  });
  expect(setup.status).toBe(400);
  expect(errorCode(setup.body)).toBe("TOTP_ALREADY_ENABLED");
});

test("the last second factor can't be removed", async () => {
  const { cookie, account } = await ana();
  const unconfirmed = await auth("/two-factor/remove", { cookie, body: { method: "totp" } });
  expect(unconfirmed.status).toBe(400);
  expect(errorCode(unconfirmed.body)).toBe("SECOND_FACTOR_REQUIRED");

  const refused = await auth("/two-factor/remove", {
    cookie,
    body: { method: "totp", code: totpCode(account.totpURI) },
  });
  expect(refused.status).toBe(400);
  expect(errorCode(refused.body)).toBe("LAST_METHOD");
});

test("a made-up passkey confirmation never passes a step-up check", async () => {
  const { cookie } = await ana();
  const refused = await auth("/change-password", {
    cookie,
    headers: { "x-totp-code": FAKE_PASSKEY_PROOF },
    body: { currentPassword: "not-the-password", newPassword: "never-applied-password" },
  });
  expect(refused.status).toBe(401);
  expect(errorSchema.parse(refused.body).message).toBe(
    "Your passkey confirmation expired. Confirm with your passkey again.",
  );
});

test("the methods list answers a pending sign-in without its passkeys, and nobody else", async () => {
  const anonymous = await auth("/two-factor/methods");
  expect(anonymous.status).toBe(401);

  const { account } = await ana();
  const { member } = account;
  const signedIn = await auth("/sign-in/email", {
    body: { email: member.email, password: member.password },
  });
  expect(signedIn.status).toBe(200);
  expect(signedIn.body).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ["totp"] });
  const pending = signedIn.res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0] ?? "")
    .filter((pair) => pair.includes("two_factor="))
    .join("; ");
  expect(pending).not.toBe("");

  const listed = await auth("/two-factor/methods", { cookie: pending });
  expect(listed.status).toBe(200);
  expect(methodsSchema.parse(listed.body)).toEqual({
    methods: ["totp"],
    preferred: "totp",
    passkeys: [],
  });
});
