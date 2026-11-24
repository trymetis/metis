import { headers as nextHeaders } from "next/headers";

import { getAppUser } from "@/auth/session";
import { getInstanceConfig } from "@/config/runtime";
import { safeRequest } from "@/lib/ssrf";
import { sniffImageType } from "@/mail/render/image-type";
import { rateLimit, tooManyRequests } from "@/services/rate-limit";
import { RATE_LIMITS } from "@/services/rate-limits";

const USER_AGENT = "Mozilla/5.0";
const TIMEOUT_MS = 10_000;
const SNIFF_BYTES = 16;

function fail(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function decodeTarget(param: string | null): URL | null {
  if (!param || param.length > 8192) return null;
  try {
    const url = new URL(Buffer.from(param, "base64url").toString("utf8"));
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const imageProxy = getInstanceConfig().imageProxy;
  if (!imageProxy.enabled) return fail(404);

  const appUser = await getAppUser(await nextHeaders());
  if (!appUser) return fail(401);
  if (!appUser.twoFactorEnabled) return fail(403);

  const rl = await rateLimit(appUser.userId, RATE_LIMITS.mailImageProxy);
  if (!rl.ok) return tooManyRequests(rl);

  const target = decodeTarget(new URL(request.url).searchParams.get("u"));
  if (!target) return fail(400);

  const maxBytes = Math.floor(imageProxy.maxMb * 1024 * 1024);
  let upstream: Awaited<ReturnType<typeof safeRequest>> | null = null;
  try {
    upstream = await safeRequest(target, {
      headers: { "user-agent": USER_AGENT, accept: "image/*" },
      maxRedirects: 3,
      timeoutMs: TIMEOUT_MS,
    });
    if (upstream.status < 200 || upstream.status >= 300) return fail(502);
    const declared = Number(upstream.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) return fail(413);

    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of upstream.body) {
      if (!(chunk instanceof Uint8Array)) return fail(502);
      size += chunk.byteLength;
      if (size > maxBytes) return fail(413);
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const type = sniffImageType(body.subarray(0, SNIFF_BYTES));
    if (!type) return fail(415);

    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[mail-image]", target.host, String(err));
    }
    return fail(502);
  } finally {
    await upstream?.close();
  }
}
