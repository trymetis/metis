import "server-only";
import { and, eq } from "drizzle-orm";
import type { JWTPayload } from "jose";

import { isOwnerEmail } from "@/auth/owner";
import { config } from "@/config";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { mcpClient } from "@/db/schema";

import type { McpCapabilityPrefs } from "./tools";

export const MCP_AUDIENCE = new URL("/api/mcp", config.auth.url).toString();
export const MCP_ISSUER = new URL("/api/auth", config.auth.url).toString();
export const APP_ORIGIN = new URL(config.auth.url).origin;

export type ResolvedMcpClient = {
  clientId: string;
  userId: string;
  userName: string;
  isOwner: boolean;
  hiddenWorkspaceIds: string[];
  capabilities: McpCapabilityPrefs;
};

function issuedAfter(jwt: JWTPayload, cutoff: Date): boolean {
  return typeof jwt.iat === "number" && jwt.iat * 1000 > cutoff.getTime();
}

export const MCP_RESOURCE_METADATA = new URL(
  `/.well-known/oauth-protected-resource${new URL(MCP_AUDIENCE).pathname}`,
  config.auth.url,
).toString();

export async function resolveMcpClient(
  jwt: JWTPayload,
): Promise<ResolvedMcpClient | "revoked" | null> {
  const clientId = typeof jwt.azp === "string" ? jwt.azp : undefined;
  const userId = typeof jwt.sub === "string" ? jwt.sub : undefined;
  if (!clientId || !userId) return null;

  const [row] = await db
    .select({
      clientId: mcpClient.clientId,
      userId: mcpClient.userId,
      email: user.email,
      name: user.name,
      hiddenWorkspaceIds: mcpClient.hiddenWorkspaceIds,
      capabilities: mcpClient.capabilities,
      enabled: mcpClient.enabled,
      tokensRevokedAt: mcpClient.tokensRevokedAt,
    })
    .from(mcpClient)
    .innerJoin(user, eq(user.id, mcpClient.userId))
    .where(and(eq(mcpClient.clientId, clientId), eq(mcpClient.userId, userId)))
    .limit(1);

  if (!row?.enabled) return null;
  if (row.tokensRevokedAt && !issuedAfter(jwt, row.tokensRevokedAt)) return "revoked";

  return {
    clientId: row.clientId,
    userId: row.userId,
    userName: row.name,
    isOwner: isOwnerEmail(row.email),
    hiddenWorkspaceIds: row.hiddenWorkspaceIds,
    capabilities: row.capabilities,
  };
}

export function touchMcpClient(clientId: string): void {
  void db
    .update(mcpClient)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpClient.clientId, clientId))
    .catch((err) => {
      console.error("[mcp-auth] lastUsedAt", err);
    });
}
