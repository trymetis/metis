import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { config } from "@/config";
import { workspaceRootPath } from "@/workspace/path";

import { type ConnectionProvider, type ConnectionResource, isConnectionResource } from "./types";

export const STATE_TTL_SEC = 600;

const statePayloadSchema = z.object({
  nonce: z.string(),
  provider: z.string(),
  resource: z.string(),
  resources: z.array(z.string()).optional(),
  callbackURL: z.string(),
  attachWorkspaceSlug: z.string().optional(),
  attachPreselect: z.boolean().optional(),
  expect: z.unknown().optional(),
  nativeUserId: z.unknown().optional(),
  exp: z.number(),
});

export interface ExpectedAccount {
  accountId: string;
  email: string;
}

export interface OAuthState {
  nonce: string;
  provider: ConnectionProvider;
  resource: ConnectionResource;
  resources: ConnectionResource[];
  callbackURL: string;
  attachWorkspaceSlug?: string;
  attachPreselect?: boolean;
  expect?: ExpectedAccount;
  nativeUserId?: string;
  exp: number;
}

export function nonceCookieName(nonce: string): string {
  return `metis-oauth-nonce-${nonce}`;
}

export function connectionsCallbackUrl(provider: ConnectionProvider): string {
  return `${config.auth.url}/api/connections/${provider}/callback`;
}

export function connectionsErrorPath(message: string): string {
  return `${workspaceRootPath()}?error=${encodeURIComponent(message)}`;
}

export function connectionsErrorUrl(message: string): string {
  return `${config.auth.url}${connectionsErrorPath(message)}`;
}

function sign(payload: string): string {
  return createHmac("sha256", config.auth.secret).update(payload).digest("base64url");
}

export function encodeOAuthState(input: {
  provider: ConnectionProvider;
  resource: ConnectionResource;
  resources: ConnectionResource[];
  callbackURL: string;
  attachWorkspaceSlug?: string;
  attachPreselect?: boolean;
  expect?: ExpectedAccount;
  nativeUserId?: string;
}): { state: string; nonce: string } {
  const nonce = randomUUID();
  const payload = Buffer.from(
    JSON.stringify({
      nonce,
      ...input,
      exp: Date.now() + STATE_TTL_SEC * 1000,
    } satisfies OAuthState),
    "utf8",
  ).toString("base64url");
  return { state: `${payload}.${sign(payload)}`, nonce };
}

function parseExpected(raw: unknown): ExpectedAccount | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { accountId, email } = raw as Partial<ExpectedAccount>;
  if (typeof accountId !== "string" || accountId.length === 0) return undefined;
  if (typeof email !== "string" || email.length === 0) return undefined;
  return { accountId, email };
}

export function decodeOAuthState(
  raw: string | null | undefined,
  expectedProvider: ConnectionProvider,
): OAuthState | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = raw.slice(0, dot);
  const provided = Buffer.from(raw.slice(dot + 1), "utf8");
  const expected = Buffer.from(sign(payload), "utf8");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const decoded = statePayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!decoded.success) return null;
    const parsed = decoded.data;

    if (!parsed.nonce || !parsed.callbackURL) return null;
    if (parsed.provider !== expectedProvider) return null;
    if (parsed.exp <= Date.now()) return null;
    if (!isConnectionResource(parsed.resource)) return null;

    const resources = (parsed.resources ?? []).filter(isConnectionResource);

    return {
      nonce: parsed.nonce,
      provider: expectedProvider,
      resource: parsed.resource,
      resources: resources.length > 0 ? resources : [parsed.resource],
      callbackURL: parsed.callbackURL,
      attachWorkspaceSlug: parsed.attachWorkspaceSlug,
      attachPreselect: parsed.attachPreselect === true,
      expect: parseExpected(parsed.expect),
      nativeUserId:
        typeof parsed.nativeUserId === "string" && parsed.nativeUserId.length > 0
          ? parsed.nativeUserId
          : undefined,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
