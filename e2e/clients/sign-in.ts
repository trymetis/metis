import { z } from "zod";

import { APP } from "./harness";

const RETRY_FALLBACK_SEC = 60;

export async function signIn(
  email: string,
  password: string,
  code: () => Promise<string> | string,
): Promise<string> {
  const jar = new Map<string, string>();
  const cookie = () =>
    [...jar]
      .filter(([, value]) => value !== "")
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  const send = (path: string, body: unknown) =>
    fetch(`${APP}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP,
        cookie: cookie(),
      },
      body: JSON.stringify(body),
    });
  const post = async (path: string, body: unknown) => {
    let res = await send(path, body);
    while (res.status === 429) {
      const wait = Number(res.headers.get("x-retry-after") ?? RETRY_FALLBACK_SEC);
      await new Promise((done) => setTimeout(done, (wait + 1) * 1000));
      res = await send(path, body);
    }
    if (!res.ok) {
      throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
    }
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(";")[0] ?? "";
      const at = pair.indexOf("=");
      if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return z.record(z.string(), z.unknown()).parse(await res.json());
  };

  const signedIn = await post("/sign-in/email", { email, password });
  if (signedIn.twoFactorRedirect) {
    await post("/two-factor/verify-totp", { code: await code() });
  }
  return cookie();
}
