import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getInstanceConfig } from "@/config/runtime";
import { forwardedClient, inIpList, ipList } from "@/services/client-ip";
import { rateLimit } from "@/services/rate-limit";

import { errorCode } from "../diagnostics";
import { fireEvent } from "../discovery";
import { parseFieldDecls, parseHeaderRules, parseStrings } from "../fields";
import { type EndpointRow, getEndpoint, touchEndpoint, triggerById, wakeTrigger } from "../store";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_HEADERS_KEPT = 30;
const SECRET_HEADER = "x-metis-webhook-secret";
const SIGNATURE_HEADER = "x-metis-signature";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function same(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function reject(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

async function limited(endpointId: string): Promise<boolean> {
  const result = await rateLimit(endpointId, {
    scope: "workflow-inbound",
    limit: 120,
    windowSec: 60,
  });
  return !result.ok;
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  return Buffer.byteLength(text) > MAX_BODY_BYTES ? null : text;
}

function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const provided = header
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return same(provided, expected);
}

function pickBody(
  decls: ReturnType<typeof parseFieldDecls>,
  body: unknown,
): Record<string, unknown> | string {
  const source =
    body && typeof body === "object" && !Array.isArray(body)
      ? Object.fromEntries(Object.entries(body))
      : {};
  const picked: Record<string, unknown> = {};
  for (const decl of decls) {
    const value = source[decl.name];
    if (value === undefined || value === null) {
      if (decl.required) return `The body is missing ${decl.name}`;
      continue;
    }
    picked[decl.name] = value;
  }
  return decls.length > 0 ? picked : source;
}

async function handleWebhook(request: Request, endpoint: EndpointRow): Promise<Response> {
  const due = await triggerById(endpoint.triggerId);
  if (!due || !due.trigger.armed || !due.definition.enabled || due.definition.deletedAt) {
    return reject(404, "This webhook is not accepting events");
  }
  const node = due.graph.nodes.find((n) => n.id === due.trigger.nodeId);
  if (!node) return reject(404, "This webhook is not accepting events");
  const param = (name: string) => {
    const bound = node.params[name];
    return bound?.kind === "literal" ? bound.value : undefined;
  };

  const ips = parseStrings(param("ips"));
  if (ips.length > 0) {
    const address = forwardedClient(
      request.headers,
      getInstanceConfig().workflowRunner.trustedProxies,
    );
    if (!address || !inIpList(ipList(ips), address))
      return reject(403, "Not allowed from this address");
  }
  for (const rule of parseHeaderRules(param("headers"))) {
    const value = request.headers.get(rule.name);
    if (value === null || !same(value, rule.value))
      return reject(403, "A required header is missing or wrong");
  }

  const body = await readBody(request);
  if (body === null) return reject(413, "The body is larger than 256 KB");
  const auth = typeof param("auth") === "string" ? param("auth") : "secret";
  const authorized =
    auth === "hmac"
      ? verifySignature(endpoint.secret, body, request.headers.get(SIGNATURE_HEADER))
      : same(request.headers.get(SECRET_HEADER) ?? "", endpoint.secret);
  if (!authorized) {
    await touchEndpoint(endpoint.id, {
      lastError: "A request was refused: wrong secret or signature",
    });
    return reject(401, "Wrong secret or signature");
  }

  let parsed: unknown = {};
  if (body.trim()) {
    try {
      parsed = JSON.parse(body);
    } catch {
      return reject(400, "The body is not JSON");
    }
  }
  const picked = pickBody(parseFieldDecls(param("body")), parsed);
  if (typeof picked === "string") return reject(400, picked);

  const headers = Object.fromEntries(
    [...request.headers.entries()]
      .filter(
        ([name]) =>
          name !== SECRET_HEADER &&
          name !== SIGNATURE_HEADER &&
          name !== "authorization" &&
          name !== "cookie",
      )
      .slice(0, MAX_HEADERS_KEPT),
  );
  const idempotency = request.headers.get("idempotency-key")?.slice(0, 200);
  const now = new Date();
  const runId = await fireEvent({
    due,
    key: `hook:${idempotency ?? crypto.randomUUID()}`,
    scheduledFor: now,
    event: { body: picked, headers, receivedAt: now.toISOString() },
    input: { source: "inbound" },
    now,
  });
  await touchEndpoint(endpoint.id, { lastError: null });
  return Response.json({ accepted: true, runId }, { status: 202 });
}

async function handleGraph(request: Request, endpoint: EndpointRow): Promise<Response> {
  const validation = new URL(request.url).searchParams.get("validationToken");
  if (validation) {
    return new Response(validation, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  const body = await readBody(request);
  if (body === null) return reject(413, "Too large");
  let notices: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "value" in parsed && Array.isArray(parsed.value))
      notices = parsed.value;
  } catch {
    return reject(400, "Not JSON");
  }
  const genuine = notices.some(
    (notice) =>
      !!notice &&
      typeof notice === "object" &&
      "clientState" in notice &&
      typeof notice.clientState === "string" &&
      same(notice.clientState, endpoint.secret),
  );
  if (!genuine) return reject(401, "Unknown subscription");
  await wakeTrigger(endpoint.triggerId, new Date());
  await touchEndpoint(endpoint.id, { lastError: null });
  return new Response(null, { status: 202 });
}

async function handleChannel(request: Request, endpoint: EndpointRow): Promise<Response> {
  const token = request.headers.get("x-goog-channel-token") ?? "";
  if (!same(token, endpoint.secret)) return reject(401, "Unknown channel");
  const state = request.headers.get("x-goog-resource-state");
  if (state !== "sync") await wakeTrigger(endpoint.triggerId, new Date());
  await touchEndpoint(endpoint.id, { lastError: null });
  return new Response(null, { status: 200 });
}

export async function handleInbound(request: Request, endpointId: string): Promise<Response> {
  try {
    if (await limited(endpointId)) return reject(429, "Too many requests");
    const endpoint = await getEndpoint(endpointId);
    if (!endpoint) return reject(404, "Unknown endpoint");
    switch (endpoint.kind) {
      case "webhook":
        return await handleWebhook(request, endpoint);
      case "graph":
        return await handleGraph(request, endpoint);
      case "google-channel":
        return await handleChannel(request, endpoint);
      default:
        return reject(404, "Unknown endpoint");
    }
  } catch (err) {
    console.error(
      `[workflow] inbound request failed endpoint=${endpointId} code=${errorCode(err)}`,
    );
    return reject(500, "The event could not be recorded");
  }
}
