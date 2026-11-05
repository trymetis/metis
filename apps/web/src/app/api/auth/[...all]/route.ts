import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/auth/server";
import { CLIENT_IP_HEADER } from "@/lib/client-ip-header";
import { clientIp } from "@/services/client-ip";

function withClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = clientIp(request.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    signal: request.signal,
    ...(hasBody ? { body: request.body, duplex: "half" } : {}),
  };
  return new Request(request.url, init);
}

export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(withClientIp(request)));
