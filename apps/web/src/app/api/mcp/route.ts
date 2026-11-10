import type http from "node:http";

import { requireMcpAuth } from "@better-auth/mcp";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import type { JWTPayload } from "jose";

import { BANNED_MESSAGE } from "@/auth/ban";
import { getAuth } from "@/auth/server";
import { sectionCached } from "@/config/runtime";
import type { McpAuthInfo } from "@/mastra/mcp/context";
import { buildMcpServer } from "@/mastra/mcp/server";
import {
  APP_ORIGIN,
  MCP_AUDIENCE,
  MCP_RESOURCE_METADATA,
  resolveMcpClient,
  touchMcpClient,
} from "@/mcp/auth";
import { aiEnabled } from "@/services/llm";
import { rateLimit, tooManyRequests } from "@/services/rate-limit";

const handle = async (request: Request, jwt: JWTPayload) => {
  if (!aiEnabled()) return new Response(null, { status: 404 });

  const client = await resolveMcpClient(jwt);
  if (client === "revoked") {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "This access token was revoked. Sign in again." },
        id: null,
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer error="invalid_token", error_description="The access token was revoked", resource_metadata="${MCP_RESOURCE_METADATA}"`,
        },
      },
    );
  }
  if (client === "banned") {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: BANNED_MESSAGE }, id: null },
      { status: 403 },
    );
  }
  if (!client) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "This MCP client is disabled or no longer registered. Re-add it in Metis Suite under Settings → MCP.",
        },
        id: null,
      },
      { status: 403 },
    );
  }

  const rl = await rateLimit(client.clientId, {
    scope: "mcp",
    limit: 60,
    windowSec: 60,
  });
  if (!rl.ok) return tooManyRequests(rl);

  touchMcpClient(client.clientId);
  const mcpServer = buildMcpServer(client.capabilities.tools, {
    instanceRole: client.instanceRole,
  });

  const authorization = request.headers.get("authorization") ?? "";
  const { req, res } = toReqRes(request);
  (req as http.IncomingMessage & { auth?: McpAuthInfo }).auth = {
    token: authorization.replace(/^Bearer /, ""),
    clientId: client.clientId,
    scopes: typeof jwt.scope === "string" ? jwt.scope.split(" ") : [],
    expiresAt: typeof jwt.exp === "number" ? jwt.exp : 0,
    extra: {
      userId: client.userId,
      userName: client.userName,
      userEmail: client.userEmail,
      instanceRole: client.instanceRole,
      hiddenWorkspaceIds: client.hiddenWorkspaceIds,
    },
  };

  const served = mcpServer.startHTTP({
    url: new URL(request.url),
    httpPath: "/api/mcp",
    req,
    res,
    options: { serverless: true },
  });
  try {
    return await Promise.race([toFetchResponse(res), served.then(() => toFetchResponse(res))]);
  } catch (err) {
    console.error("[mcp]", err);
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      },
      { status: 500 },
    );
  }
};

const protectedHandler = sectionCached(["signup", "cache"], () =>
  requireMcpAuth(getAuth(), handle, { resource: MCP_AUDIENCE }),
);

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== APP_ORIGIN) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Origin not allowed" },
        id: null,
      },
      { status: 403 },
    );
  }
  return protectedHandler()(request);
}
