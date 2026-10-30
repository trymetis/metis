import { createServer } from "node:http";

import {
  type AuthorizationServerMetadata,
  Client,
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  type OAuthTokens,
  refreshAuthorization,
  StreamableHTTPClientTransport,
  startAuthorization,
} from "@modelcontextprotocol/client";
import { z } from "zod";

import { MCP_CLIENT_HOSTS } from "../lib/cast";
import { APP } from "./harness";

export const ISSUER = `${APP}/api/auth`;
export const RESOURCE = `${APP}/api/mcp`;
export const PROTECTED_RESOURCE_METADATA = `${APP}/.well-known/oauth-protected-resource/api/mcp`;
export const MODERN = "2026-07-28";
export const ERAS = ["legacy", MODERN] as const;
export type Era = (typeof ERAS)[number];

const SERVICE_CONTROL = "http://localhost:8098";

export function clientIdFor(name: string, host: "public" | "private" = "public"): string {
  const domain = MCP_CLIENT_HOSTS[host];
  return `https://${domain}/clients/${name}.json`;
}

export async function documentHits(): Promise<{ path: string; at: string }[]> {
  const res = await fetch(`${SERVICE_CONTROL}/hits`);
  return z.array(z.object({ path: z.string(), at: z.string() })).parse(await res.json());
}

let metadata: Promise<AuthorizationServerMetadata> | undefined;

export function authServerMetadata(): Promise<AuthorizationServerMetadata> {
  metadata ??= discoverAuthorizationServerMetadata(ISSUER).then((found) => {
    if (!found) throw new Error(`no authorization server metadata at ${ISSUER}`);
    return found;
  });
  return metadata;
}

export interface Callback {
  redirectUri: string;
  next(): Promise<URLSearchParams>;
  close(): Promise<void>;
}

export async function listenForCallback(host = "127.0.0.1"): Promise<Callback> {
  const waiting: ((params: URLSearchParams) => void)[] = [];
  const received: URLSearchParams[] = [];
  const server = createServer((req, res) => {
    const params = new URLSearchParams(new URL(req.url ?? "/", "http://callback").search);
    res.writeHead(200, { "content-type": "text/plain" }).end("You can close this tab.\n");
    const resolve = waiting.shift();
    if (resolve) resolve(params);
    else received.push(params);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("the callback server did not bind a TCP port");
  }
  const { port } = address;
  return {
    redirectUri: `http://${host}:${port}/callback`,
    next: () => {
      const ready = received.shift();
      if (ready) return Promise.resolve(ready);
      return new Promise((resolve) => waiting.push(resolve));
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface AuthorizationStart {
  authorizationUrl: URL;
  codeVerifier: string;
  redirectUri: string;
  callback: Callback;
}

export async function beginAuthorization(
  clientId: string,
  options: { redirectHost?: string } = {},
): Promise<AuthorizationStart> {
  const callback = await listenForCallback(options.redirectHost);
  const { authorizationUrl, codeVerifier } = await startAuthorization(ISSUER, {
    metadata: await authServerMetadata(),
    clientInformation: { client_id: clientId },
    redirectUrl: callback.redirectUri,
    scope: "offline_access",
    resource: RESOURCE,
  });
  return {
    authorizationUrl,
    codeVerifier,
    redirectUri: callback.redirectUri,
    callback,
  };
}

export async function finishAuthorization(
  clientId: string,
  start: AuthorizationStart,
): Promise<OAuthTokens> {
  const params = await start.callback.next();
  await start.callback.close();
  const code = params.get("code");
  if (!code) throw new Error(`authorization failed: ${params.toString()}`);
  return exchangeAuthorization(ISSUER, {
    metadata: await authServerMetadata(),
    clientInformation: { client_id: clientId },
    authorizationCode: code,
    iss: params.get("iss") ?? undefined,
    codeVerifier: start.codeVerifier,
    redirectUri: start.redirectUri,
    resource: RESOURCE,
  });
}

export async function authorizeStatus(
  cookie: string,
  clientId: string,
  redirectUri: string,
): Promise<{ status: number; body: string; location: string | null }> {
  const { authorizationUrl } = await startAuthorization(ISSUER, {
    metadata: await authServerMetadata(),
    clientInformation: { client_id: clientId },
    redirectUrl: redirectUri,
    scope: "offline_access",
    resource: RESOURCE,
  });
  const res = await fetch(authorizationUrl, {
    headers: { cookie },
    redirect: "manual",
  });
  return {
    status: res.status,
    body: await res.text(),
    location: res.headers.get("location"),
  };
}

export async function refresh(clientId: string, refreshToken: string): Promise<OAuthTokens> {
  return refreshAuthorization(ISSUER, {
    metadata: await authServerMetadata(),
    clientInformation: { client_id: clientId },
    refreshToken,
    resource: RESOURCE,
  });
}

export async function connect(accessToken: string, era: Era): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client(
    { name: "metis-e2e", version: "1.0.0" },
    {
      versionNegotiation: { mode: era === "legacy" ? "legacy" : { pin: era } },
    },
  );
  await client.connect(transport);
  return client;
}

const toolResultSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
});

const jsonObjectSchema = z.record(z.string(), z.unknown());

export function toolJson<T>(result: unknown, schema: z.ZodType<T>): T {
  const content = toolResultSchema.safeParse(result).data?.content ?? [];
  const text = content.find((c) => c.type === "text")?.text;
  if (text === undefined) throw new Error(`tool result has no text: ${JSON.stringify(result)}`);
  return schema.parse(JSON.parse(text));
}

export function toolText(result: unknown): string {
  const content = toolResultSchema.safeParse(result).data?.content ?? [];
  return content.map((c) => c.text ?? "").join("\n");
}

export function modernBody(
  method: string,
  params: Record<string, unknown> = {},
  protocolVersion = MODERN,
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": protocolVersion,
        "io.modelcontextprotocol/clientInfo": {
          name: "metis-e2e",
          version: "1.0.0",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
}

export function modernHeaders(method: string, name?: string): Record<string, string> {
  return {
    "MCP-Protocol-Version": MODERN,
    "Mcp-Method": method,
    ...(name ? { "Mcp-Name": name } : {}),
  };
}

export async function postMcp(
  accessToken: string | null,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(RESOURCE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export async function jsonRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .at(-1);
    return data ? jsonObjectSchema.parse(JSON.parse(data)) : {};
  }
  return text ? jsonObjectSchema.parse(JSON.parse(text)) : {};
}
