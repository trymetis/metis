import "server-only";
import type { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";

import { listMcpWorkspaces, type McpWorkspace, visibleMcpWorkspaces } from "@/mcp/workspaces";
import type { AccountCtx } from "@/ops/account";
import { INSTANCE_ROLES } from "@/types/instance-role";

import { resolveWorkspaceScope, type WorkspaceCtx } from "../runtime-context";
import { ToolRefusal } from "../toolkit/resolve";

const mcpAuthInfoSchema = z.object({
  token: z.string(),
  clientId: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.number().optional(),
  extra: z
    .object({
      userId: z.string().optional(),
      userName: z.string().optional(),
      userEmail: z.string().optional(),
      instanceRole: z.enum(INSTANCE_ROLES).nullable().optional(),
      hiddenWorkspaceIds: z.array(z.string()).optional(),
    })
    .optional(),
});

export type McpAuthInfo = z.infer<typeof mcpAuthInfoSchema>;

export type McpWorkspaceScope = { workspace: McpWorkspace; ctx: WorkspaceCtx };

type RequestScopes = {
  visible?: Promise<McpWorkspace[]>;
  workspaces: Map<string, Promise<McpWorkspaceScope>>;
};

const scopesByRequest = new WeakMap<RequestContext, RequestScopes>();

function requestScopes(requestContext: RequestContext): RequestScopes {
  let scopes = scopesByRequest.get(requestContext);
  if (!scopes) {
    scopes = { workspaces: new Map() };
    scopesByRequest.set(requestContext, scopes);
  }
  return scopes;
}

export function mcpAccountFromCall(requestContext: RequestContext | undefined): AccountCtx {
  const parsed = mcpAuthInfoSchema.safeParse(requestContext?.get("authInfo"));
  const authInfo = parsed.success ? parsed.data : undefined;
  const userId = authInfo?.extra?.userId;
  if (!authInfo || !userId) throw new Error("Unauthenticated MCP request");
  return {
    userId,
    userName: authInfo.extra?.userName ?? "",
    userEmail: authInfo.extra?.userEmail ?? "",
    instanceRole: authInfo.extra?.instanceRole ?? null,
    clientId: authInfo.clientId,
    hiddenWorkspaceIds: authInfo.extra?.hiddenWorkspaceIds ?? [],
  };
}

export async function mcpVisibleWorkspaces(
  requestContext: RequestContext | undefined,
): Promise<McpWorkspace[]> {
  if (!requestContext) throw new Error("Unauthenticated MCP request");
  const account = mcpAccountFromCall(requestContext);
  const scopes = requestScopes(requestContext);
  scopes.visible ??= listMcpWorkspaces(account.userId).then((all) =>
    visibleMcpWorkspaces(all, account.hiddenWorkspaceIds),
  );
  return scopes.visible;
}

function unknownWorkspace(workspaceId: string, visible: McpWorkspace[]): ToolRefusal {
  const choices =
    visible.length === 0
      ? "This client can reach no workspace right now: every workspace is hidden from it or has AI turned off."
      : `Pick from these, which are all of them: ${visible
          .map((w) => `${w.id} (${w.name})`)
          .join(", ")}`;
  return new ToolRefusal(
    `Unknown workspaceId "${workspaceId}" — not a workspace this client can reach. ${choices}`,
  );
}

async function buildMcpWorkspaceScope(
  requestContext: RequestContext,
  workspaceId: string,
): Promise<McpWorkspaceScope> {
  const account = mcpAccountFromCall(requestContext);
  const visible = await mcpVisibleWorkspaces(requestContext);
  const workspace = visible.find((w) => w.id === workspaceId);
  if (!workspace) throw unknownWorkspace(workspaceId, visible);

  const ctx = await resolveWorkspaceScope(
    {
      userId: account.userId,
      workspaceId: workspace.id,
      workspaceRole: workspace.role,
    },
    { kind: "mcp", clientId: account.clientId },
  );
  if (!ctx) {
    throw unknownWorkspace(
      workspaceId,
      visible.filter((w) => w.id !== workspaceId),
    );
  }
  return { workspace, ctx };
}

export function mcpWorkspaceFromCall(
  requestContext: RequestContext | undefined,
  workspaceId: string,
): Promise<McpWorkspaceScope> {
  if (!requestContext) {
    return Promise.reject(new Error("Unauthenticated MCP request"));
  }
  const scopes = requestScopes(requestContext);
  const hit = scopes.workspaces.get(workspaceId);
  if (hit) return hit;

  const pending = buildMcpWorkspaceScope(requestContext, workspaceId);
  scopes.workspaces.set(workspaceId, pending);
  return pending;
}

export async function mcpScopeFromCall(
  requestContext: RequestContext | undefined,
  workspaceId: string,
): Promise<WorkspaceCtx> {
  return (await mcpWorkspaceFromCall(requestContext, workspaceId)).ctx;
}
