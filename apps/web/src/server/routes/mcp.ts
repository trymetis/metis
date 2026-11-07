import "server-only";
import { createHash } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { appActor, recordAuditEvent } from "@/audit";
import { isOwnerEmail } from "@/auth/owner";
import { verify2FA } from "@/auth/server";
import { config } from "@/config";
import { db } from "@/db";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@/db/auth-schema";
import { mcpClient } from "@/db/schema";
import { MCP_AUDIENCE } from "@/mcp/auth";
import { createManualMcpClient, setMcpClientTools } from "@/mcp/clients";
import { MCP_PRESETS } from "@/mcp/presets";
import { uniqueMcpClientSlug } from "@/mcp/slug";
import { isMcpToolEnabled, mcpToolsFor, sensitiveToolsTurnedOn } from "@/mcp/tools";
import { listMcpWorkspaces } from "@/mcp/workspaces";
import { rateLimit } from "@/services/rate-limit";

import { appSession } from "../middlewares/app-session";
import {
  createMcpClientInputSchema,
  createMcpClientOutputSchema,
  deleteMcpClientInputSchema,
  getMcpClientInputSchema,
  listMcpGrantsInputSchema,
  type McpClient,
  mcpAccessOutputSchema,
  mcpClientSchema,
  mcpGrantSchema,
  publicMcpClientInputSchema,
  publicMcpClientOutputSchema,
  registerMcpConsentClientInputSchema,
  revokeMcpGrantsInputSchema,
  revokeMcpGrantsOutputSchema,
  setMcpClientEnabledInputSchema,
  setMcpClientHiddenWorkspacesInputSchema,
  setMcpClientToolsInputSchema,
} from "../schema";

function codexCallbackId(serverUrl: string): string {
  return createHash("sha256").update(serverUrl).digest().subarray(0, 9).toString("base64url");
}

function storedStringArray(value: unknown): string[] {
  if (typeof value !== "string") {
    throw new Error("Expected a Better Auth array column stored as text");
  }
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
    throw new Error("Expected a Better Auth array column of strings");
  }
  return parsed;
}

function cimdClientName(name: string | null): string {
  if (name === null) throw new Error("A CIMD client has no client_name");
  return name;
}

async function ownedClient(clientId: string, userId: string) {
  const [row] = await db
    .select()
    .from(mcpClient)
    .where(and(eq(mcpClient.clientId, clientId), eq(mcpClient.userId, userId)))
    .limit(1);
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "Client not found" });
  }
  return row;
}

async function loadClients(userId: string): Promise<McpClient[]> {
  const rows = await db
    .select({
      clientId: mcpClient.clientId,
      slug: mcpClient.slug,
      label: mcpClient.label,
      preset: mcpClient.preset,
      enabled: mcpClient.enabled,
      capabilities: mcpClient.capabilities,
      hiddenWorkspaceIds: mcpClient.hiddenWorkspaceIds,
      createdAt: mcpClient.createdAt,
      lastUsedAt: mcpClient.lastUsedAt,
    })
    .from(mcpClient)
    .where(eq(mcpClient.userId, userId))
    .orderBy(desc(mcpClient.createdAt));

  const grantCounts = await db
    .select({
      clientId: oauthRefreshToken.clientId,
      activeGrants: count(),
    })
    .from(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.userId, userId),
        isNull(oauthRefreshToken.revoked),
        gt(oauthRefreshToken.expiresAt, new Date()),
      ),
    )
    .groupBy(oauthRefreshToken.clientId);

  const byClient = new Map(grantCounts.map((g) => [g.clientId, g.activeGrants]));

  return rows.map((row) => ({
    clientId: row.clientId,
    slug: row.slug,
    label: row.label,
    preset: row.preset,
    activeGrants: byClient.get(row.clientId) ?? 0,
    enabled: row.enabled,
    tools: row.capabilities.tools ?? {},
    hiddenWorkspaceIds: row.hiddenWorkspaceIds,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  }));
}

async function memberWorkspaceIds(
  userId: string,
  workspaceIds: readonly string[],
): Promise<string[]> {
  const mine = new Set((await listMcpWorkspaces(userId)).map((w) => w.id));
  return [...new Set(workspaceIds)].filter((id) => mine.has(id));
}

export const mcpRouter = {
  access: appSession.output(mcpAccessOutputSchema).handler(async ({ context }) => ({
    isOwner: isOwnerEmail(context.appUser.user.email),
    workspaces: await listMcpWorkspaces(context.appUser.userId),
  })),

  listClients: appSession
    .output(z.array(mcpClientSchema))
    .handler(({ context }) => loadClients(context.appUser.userId)),

  getClient: appSession
    .input(getMcpClientInputSchema)
    .output(mcpClientSchema.nullable())
    .handler(async ({ input, context }) => {
      const clients = await loadClients(context.appUser.userId);
      return clients.find((c) => c.slug === input.slug) ?? null;
    }),

  createClient: appSession
    .input(createMcpClientInputSchema)
    .output(createMcpClientOutputSchema)
    .handler(async ({ input, context }) => {
      const rl = await rateLimit(context.appUser.userId, {
        scope: "mcp-client-create",
        limit: 10,
        windowSec: 300,
      });
      if (!rl.ok) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many attempts. Please slow down.",
          data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
        });
      }

      const preset = MCP_PRESETS[input.preset];
      if (preset.needsPinnedPort && !input.port) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${preset.label} needs a fixed sign-in port.`,
        });
      }

      const redirectUris =
        input.preset === "custom"
          ? (input.redirectUris ?? [])
          : preset.redirectUris({
              port: input.port,
              callbackId: codexCallbackId(MCP_AUDIENCE),
              origin: config.auth.url,
            });

      if (redirectUris.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "At least one callback URL is required",
        });
      }

      const row = await createManualMcpClient({
        userId: context.appUser.userId,
        label: input.label,
        preset: input.preset,
        redirectUris,
      });
      const { clientId } = row;
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "mcp_client.created",
        targetLabel: row.label,
        detail: { clientId, preset: input.preset },
      });

      return {
        client: {
          clientId,
          slug: row.slug,
          label: row.label,
          preset: input.preset,
          activeGrants: 0,
          enabled: row.enabled,
          tools: {},
          hiddenWorkspaceIds: row.hiddenWorkspaceIds,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
        },
        instructions: preset.instructions({
          clientId,
          port: input.port,
          mcpUrl: MCP_AUDIENCE,
        }),
      };
    }),

  setEnabled: appSession
    .input(setMcpClientEnabledInputSchema)
    .output(z.object({ status: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const client = await ownedClient(input.clientId, context.appUser.userId);

      if (input.enabled) {
        const rl = await rateLimit(context.appUser.userId, {
          scope: "mcp-client-enable",
          limit: 10,
          windowSec: 300,
        });
        if (!rl.ok) {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: "Too many attempts. Please slow down.",
            data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
          });
        }
        if (!input.code) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Enter your authenticator code to re-enable this client",
          });
        }
        const verified = await verify2FA({
          code: input.code,
          headers: context.headers,
        });
        if (!verified) {
          throw new ORPCError("UNAUTHORIZED", {
            message: "Invalid authenticator or backup code",
          });
        }
      }

      await db
        .update(mcpClient)
        .set({ enabled: input.enabled })
        .where(eq(mcpClient.clientId, input.clientId));

      await db
        .update(oauthClient)
        .set({ disabled: !input.enabled, updatedAt: new Date() })
        .where(eq(oauthClient.clientId, input.clientId));

      if (input.enabled && !client.enabled) {
        await recordAuditEvent(appActor(context.appUser, context.headers), {
          action: "mcp_client.enabled",
          targetLabel: client.label,
          detail: { clientId: input.clientId },
        });
      }

      return { status: true as const };
    }),

  setTools: appSession
    .input(setMcpClientToolsInputSchema)
    .output(z.object({ status: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const row = await ownedClient(input.clientId, context.appUser.userId);

      await setMcpClientTools(input.clientId, row.capabilities, input.tools);

      const turnedOn = sensitiveToolsTurnedOn(row.capabilities.tools, input.tools);
      if (turnedOn.length > 0) {
        await recordAuditEvent(appActor(context.appUser, context.headers), {
          action: "mcp_client.sensitive_tools_enabled",
          targetLabel: row.label,
          detail: { clientId: input.clientId, tools: turnedOn },
        });
      }

      return { status: true as const };
    }),

  setHiddenWorkspaces: appSession
    .input(setMcpClientHiddenWorkspacesInputSchema)
    .output(z.object({ hiddenWorkspaceIds: z.array(z.string()) }))
    .handler(async ({ input, context }) => {
      await ownedClient(input.clientId, context.appUser.userId);

      const hiddenWorkspaceIds = await memberWorkspaceIds(
        context.appUser.userId,
        input.workspaceIds,
      );

      await db
        .update(mcpClient)
        .set({ hiddenWorkspaceIds })
        .where(eq(mcpClient.clientId, input.clientId));

      return { hiddenWorkspaceIds };
    }),

  listGrants: appSession
    .input(listMcpGrantsInputSchema)
    .output(z.array(mcpGrantSchema))
    .handler(async ({ input, context }) => {
      await ownedClient(input.clientId, context.appUser.userId);

      const rows = await db
        .select({
          id: oauthRefreshToken.id,
          authTime: oauthRefreshToken.authTime,
          createdAt: oauthRefreshToken.createdAt,
          expiresAt: oauthRefreshToken.expiresAt,
          scopes: oauthRefreshToken.scopes,
        })
        .from(oauthRefreshToken)
        .where(
          and(
            eq(oauthRefreshToken.clientId, input.clientId),
            eq(oauthRefreshToken.userId, context.appUser.userId),
            isNull(oauthRefreshToken.revoked),
            gt(oauthRefreshToken.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(oauthRefreshToken.createdAt));

      return rows.map((row) => ({
        id: row.id,
        authorizedAt: row.authTime ?? row.createdAt,
        expiresAt: row.expiresAt,
        scopes: storedStringArray(row.scopes),
      }));
    }),

  revokeGrants: appSession
    .input(revokeMcpGrantsInputSchema)
    .output(revokeMcpGrantsOutputSchema)
    .handler(async ({ input, context }) => {
      await ownedClient(input.clientId, context.appUser.userId);

      const scope = [
        eq(oauthRefreshToken.clientId, input.clientId),
        eq(oauthRefreshToken.userId, context.appUser.userId),
      ];
      if (input.grantId) {
        scope.push(eq(oauthRefreshToken.id, input.grantId));
      }

      const revoked = await db
        .delete(oauthRefreshToken)
        .where(and(...scope))
        .returning({ id: oauthRefreshToken.id });

      await db
        .update(mcpClient)
        .set({ tokensRevokedAt: new Date() })
        .where(
          and(eq(mcpClient.clientId, input.clientId), eq(mcpClient.userId, context.appUser.userId)),
        );

      const [remaining] = input.grantId
        ? await db
            .select({ id: oauthRefreshToken.id })
            .from(oauthRefreshToken)
            .where(
              and(
                eq(oauthRefreshToken.clientId, input.clientId),
                eq(oauthRefreshToken.userId, context.appUser.userId),
                isNull(oauthRefreshToken.revoked),
                gt(oauthRefreshToken.expiresAt, new Date()),
              ),
            )
            .limit(1)
        : [];

      if (!remaining) {
        await db
          .delete(oauthAccessToken)
          .where(
            and(
              eq(oauthAccessToken.clientId, input.clientId),
              eq(oauthAccessToken.userId, context.appUser.userId),
            ),
          );

        await db
          .delete(oauthConsent)
          .where(
            and(
              eq(oauthConsent.clientId, input.clientId),
              eq(oauthConsent.userId, context.appUser.userId),
            ),
          );
      }

      return { revoked: revoked.length };
    }),

  deleteClient: appSession
    .input(deleteMcpClientInputSchema)
    .output(z.object({ status: z.literal(true) }))
    .handler(async ({ input, context }) => {
      await ownedClient(input.clientId, context.appUser.userId);

      await db.delete(oauthClient).where(eq(oauthClient.clientId, input.clientId));

      return { status: true as const };
    }),

  publicClient: appSession
    .input(publicMcpClientInputSchema)
    .output(publicMcpClientOutputSchema)
    .handler(async ({ input, context }) => {
      const [row] = await db
        .select({
          label: mcpClient.label,
          preset: mcpClient.preset,
          hiddenWorkspaceIds: mcpClient.hiddenWorkspaceIds,
          capabilities: mcpClient.capabilities,
        })
        .from(mcpClient)
        .where(
          and(eq(mcpClient.clientId, input.clientId), eq(mcpClient.userId, context.appUser.userId)),
        )
        .limit(1);

      if (row) {
        const tools = row.capabilities.tools;
        return {
          status: "connected" as const,
          label: row.label,
          preset: row.preset,
          hiddenWorkspaceIds: row.hiddenWorkspaceIds,
          tools: mcpToolsFor({
            isOwner: isOwnerEmail(context.appUser.user.email),
          })
            .filter((tool) => isMcpToolEnabled(tools, tool.key))
            .map((tool) => ({ key: tool.key, label: tool.label })),
        };
      }

      const [discovered] = await db
        .select({
          name: oauthClient.name,
          discoveryId: oauthClient.clientDiscoveryId,
          redirectUris: oauthClient.redirectUris,
        })
        .from(oauthClient)
        .where(eq(oauthClient.clientId, input.clientId))
        .limit(1);

      if (discovered?.discoveryId !== "cimd") {
        return { status: "unknown" as const };
      }

      const redirectHosts = [
        ...new Set(storedStringArray(discovered.redirectUris).map((uri) => new URL(uri).hostname)),
      ];

      return {
        status: "new" as const,
        label: cimdClientName(discovered.name),
        clientIdUrl: input.clientId,
        redirectHosts,
      };
    }),

  registerConsentClient: appSession
    .input(registerMcpConsentClientInputSchema)
    .output(z.object({ status: z.literal(true) }))
    .handler(async ({ input, context }) => {
      const rl = await rateLimit(context.appUser.userId, {
        scope: "mcp-consent-register",
        limit: 10,
        windowSec: 300,
      });
      if (!rl.ok) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many attempts. Please slow down.",
          data: { retryAfterSec: Math.ceil(rl.resetMs / 1000) },
        });
      }

      const [existing] = await db
        .select({ userId: mcpClient.userId })
        .from(mcpClient)
        .where(eq(mcpClient.clientId, input.clientId))
        .limit(1);
      if (existing && existing.userId !== context.appUser.userId) {
        throw new ORPCError("CONFLICT", {
          message: "This client is already connected",
        });
      }

      const [client] = await db
        .select({
          clientId: oauthClient.clientId,
          name: oauthClient.name,
          discoveryId: oauthClient.clientDiscoveryId,
        })
        .from(oauthClient)
        .where(eq(oauthClient.clientId, input.clientId))
        .limit(1);
      if (client?.discoveryId !== "cimd") {
        throw new ORPCError("NOT_FOUND", {
          message: "Unknown client",
        });
      }

      const verified = await verify2FA({
        code: input.code,
        headers: context.headers,
      });
      if (!verified) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Invalid authenticator or backup code",
        });
      }

      const hiddenWorkspaceIds = await memberWorkspaceIds(
        context.appUser.userId,
        input.hiddenWorkspaceIds ?? [],
      );

      const sensitiveTools = sensitiveToolsTurnedOn(undefined, input.tools);
      const approved = () =>
        recordAuditEvent(appActor(context.appUser, context.headers), {
          action: "mcp_client.approved",
          targetLabel: client.name ?? input.clientId,
          detail: { clientId: input.clientId, sensitiveTools },
        });

      if (existing) {
        await db
          .update(mcpClient)
          .set({ capabilities: { tools: input.tools }, hiddenWorkspaceIds })
          .where(eq(mcpClient.clientId, input.clientId));
        await approved();
        return { status: true as const };
      }

      const label = cimdClientName(client.name).slice(0, 60);
      await db.insert(mcpClient).values({
        clientId: input.clientId,
        userId: context.appUser.userId,
        label,
        slug: await uniqueMcpClientSlug(context.appUser.userId, label),
        preset: null,
        enabled: true,
        capabilities: { tools: input.tools },
        hiddenWorkspaceIds,
        createdAt: new Date(),
      });
      await approved();

      return { status: true as const };
    }),
};
