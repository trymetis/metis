import {
  ALL_TOOLS_ON,
  CLIENT_PROFILES,
  MCP_CLIENT_REDIRECT,
  OWNER_CLIENTS,
  type OwnerClient,
  ownerClientsSchema,
  type SeededMcpClient,
} from "@metis/e2e/lib/mcp-clients";

import { getAuth } from "../../../src/auth/server";
import { MCP_AUDIENCE, MCP_ISSUER } from "../../../src/mcp/auth";
import { createManualMcpClient, setMcpClientTools } from "../../../src/mcp/clients";
import { MCP_TOOL_KEYS, type McpToolPrefs } from "../../../src/mcp/tools";
import { stableId } from "../stable-ids";
import type { Account } from "./account";

const TOKEN_LIFETIME_SEC = 10 * 365 * 24 * 60 * 60;

const EVERY_TOOL: McpToolPrefs = Object.fromEntries(MCP_TOOL_KEYS.map((key) => [key, true]));

async function seedClient(
  owner: Account,
  name: OwnerClient | "member",
  allTools: boolean,
): Promise<SeededMcpClient> {
  const profile = CLIENT_PROFILES[name];
  const row = await createManualMcpClient({
    userId: owner.userId,
    label: profile.label,
    preset: profile.preset,
    redirectUris: [MCP_CLIENT_REDIRECT],
  });
  if (allTools) {
    await setMcpClientTools(row.clientId, row.capabilities, EVERY_TOOL);
  }

  const now = Math.floor(Date.now() / 1000);
  const { token } = await getAuth().api.signJWT({
    body: {
      payload: {
        sub: stableId(`user:${owner.email.toLowerCase()}`),
        azp: row.clientId,
        iss: MCP_ISSUER,
        aud: MCP_AUDIENCE,
        scope: "offline_access",
        iat: now,
        exp: now + TOKEN_LIFETIME_SEC,
      },
    },
  });
  return { clientId: row.clientId, token };
}

export async function seedMcpClients(
  owner: Account,
  member: Account,
): Promise<{
  clients: Record<OwnerClient, SeededMcpClient>;
  member: SeededMcpClient;
}> {
  const seeded: [OwnerClient, SeededMcpClient][] = [];
  for (const name of OWNER_CLIENTS) {
    seeded.push([name, await seedClient(owner, name, ALL_TOOLS_ON.has(name))]);
  }
  const clients = ownerClientsSchema.parse(Object.fromEntries(seeded));
  const memberClient = await seedClient(member, "member", true);
  console.log(
    `[generate] seeded ${OWNER_CLIENTS.length} MCP clients for ${owner.email} and one for ${member.email}, with signed access tokens`,
  );
  return { clients, member: memberClient };
}
