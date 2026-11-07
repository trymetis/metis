"use client";

import { Badge } from "@metis/ui/components/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { McpClientEnableSwitch, McpClientRemoveButton } from "@/components/mcp-client-actions";
import { McpPresetIcon } from "@/components/mcp-preset-icon";
import { PageHeader } from "@/components/page-header";
import { rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { formatRelativeDate } from "@/lib/utils";
import { MCP_PRESETS, SELF_REGISTERED_LABEL } from "@/mcp/presets";
import type { McpAccess, McpClient } from "@/server/schema";

import { AddClientDialog } from "./add-client-dialog";

function reachableCount(access: McpAccess, client: McpClient): number {
  const hidden = new Set(client.hiddenWorkspaceIds);
  return access.workspaces.filter((w) => w.aiAvailable && !hidden.has(w.id)).length;
}

export function McpSettings({
  initialClients,
  access,
}: {
  initialClients: McpClient[];
  access: McpAccess;
}) {
  const queryClient = useQueryClient();
  const listClients = rpc.mcp.listClients;
  const query = useQuery(
    listClients.queryOptions({ initialData: initialClients, staleTime: Infinity }),
  );
  const clients = query.data;
  function setClients(update: (list: McpClient[]) => McpClient[]) {
    queryClient.setQueryData(listClients.queryKey(), (list) => (list ? update(list) : list));
  }
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const result = await refreshQuery(listClients.queryKey());
    if (result?.error) setError(result.error.message || "Could not refresh");
  }

  return (
    <div>
      <PageHeader
        title="MCP clients"
        description="Connect an AI client to the mailboxes, calendars, drives and address books in your workspaces. Each one gets its own credentials, its own tool permissions and its own list of workspaces — there is no account-wide switch, so a client that is not listed here has no access. A workspace with AI turned off is out of reach for every client."
        action={<AddClientDialog onCreated={refresh} />}
      />

      {error && (
        <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {error}
        </div>
      )}

      {clients.length === 0 ? (
        <div className="mt-7 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Bot className="mx-auto size-6 text-faint" />
          <p className="mt-3 text-[13px] font-medium text-foreground">No clients connected</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] text-faint">
            Add one to let Claude Code, Codex, Cursor or any MCP client read your mail on your
            behalf.
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-3">
          {clients.map((client) => {
            const preset = client.preset ? MCP_PRESETS[client.preset] : null;
            return (
              <div
                key={client.clientId}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-hover"
              >
                <Link
                  href={`/settings/mcp/${client.slug}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel p-2">
                    <McpPresetIcon preset={client.preset} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {client.label}
                      </p>
                      {!client.enabled && <Badge variant="secondary">Disabled</Badge>}
                    </div>
                    <p className="mt-0.5 text-[12px] text-faint">
                      {preset?.label ?? SELF_REGISTERED_LABEL}
                      {" · "}
                      {`added ${formatRelativeDate(client.createdAt.toISOString())}`}
                      {" · "}
                      {client.lastUsedAt
                        ? `last used ${formatRelativeDate(client.lastUsedAt.toISOString())}`
                        : "never used"}
                      {" · "}
                      {`${reachableCount(access, client)} of ${access.workspaces.length} workspaces`}
                      {client.activeGrants > 0 && (
                        <>
                          {" · "}
                          <span className="text-primary">
                            {client.activeGrants === 1
                              ? "authorized"
                              : `${client.activeGrants} authorizations`}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </Link>

                <McpClientEnableSwitch
                  client={client}
                  onChange={(enabled) =>
                    setClients((list) =>
                      list.map((c) => (c.clientId === client.clientId ? { ...c, enabled } : c)),
                    )
                  }
                  onError={setError}
                />
                <McpClientRemoveButton
                  client={client}
                  onRemoved={() =>
                    setClients((list) => list.filter((c) => c.clientId !== client.clientId))
                  }
                  onError={setError}
                />
                <Link
                  href={`/settings/mcp/${client.slug}`}
                  aria-label={`Open ${client.label}`}
                  className="text-faint transition-colors hover:text-foreground max-sm:hidden"
                >
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
