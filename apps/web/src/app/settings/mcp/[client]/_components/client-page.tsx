"use client";

import { Badge } from "@metis/ui/components/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { McpClientEnableSwitch, McpClientRemoveButton } from "@/components/mcp-client-actions";
import { McpPresetIcon } from "@/components/mcp-preset-icon";
import { rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { formatRelativeDate } from "@/lib/utils";
import { MCP_PRESETS, SELF_REGISTERED_LABEL } from "@/mcp/presets";
import type { McpAccess, McpClient } from "@/server/schema";

import { ClientGrants } from "./client-grants";
import { ClientTools } from "./client-tools";
import { ClientWorkspaces } from "./client-workspaces";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">{title}</h2>
      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

export function ClientPage({
  initialClient,
  access,
}: {
  initialClient: McpClient;
  access: McpAccess;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const getClient = rpc.mcp.getClient;
  const input = { slug: initialClient.slug };
  const query = useQuery(
    getClient.queryOptions({ input, initialData: initialClient, staleTime: Infinity }),
  );
  const client = query.data ?? initialClient;
  function setClient(update: (current: McpClient) => McpClient) {
    queryClient.setQueryData(getClient.queryKey({ input }), (current) =>
      update(current ?? initialClient),
    );
  }
  const [error, setError] = useState<string | null>(null);
  const preset = client.preset ? MCP_PRESETS[client.preset] : null;

  async function refresh() {
    const result = await refreshQuery(getClient.queryKey({ input }));
    if (result?.error) setError(result.error.message || "Could not refresh");
  }

  return (
    <div>
      <Link
        href="/settings/mcp"
        className="inline-flex items-center gap-1 text-[13px] text-faint transition-colors hover:text-muted-foreground"
      >
        <ChevronLeft className="size-3.5" />
        MCP clients
      </Link>

      <div className="mt-4 flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-panel p-2.5">
          <McpPresetIcon preset={client.preset} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-serif text-[28px] font-medium leading-tight tracking-tight text-foreground">
              {client.label}
            </h1>
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
          </p>
          <div className="mt-1.5 flex min-w-0 items-start gap-1">
            <p className="min-w-0 pt-1 text-[11px] text-faint">
              Client ID:{" "}
              <code className="break-all font-mono text-foreground">{client.clientId}</code>
            </p>
            <CopyButton
              value={client.clientId}
              label="Copy client ID"
              className="size-6 shrink-0"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <McpClientEnableSwitch
            client={client}
            onChange={(enabled) => setClient((c) => ({ ...c, enabled }))}
            onError={setError}
          />
          <McpClientRemoveButton
            client={client}
            onRemoved={() => router.push("/settings/mcp")}
            onError={setError}
          />
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {error}
        </div>
      )}

      <Section title="Tools">
        <ClientTools
          clientId={client.clientId}
          tools={client.tools}
          instanceRole={access.instanceRole}
          onSaved={refresh}
        />
      </Section>

      <Section title="Workspaces">
        <ClientWorkspaces
          clientId={client.clientId}
          workspaces={access.workspaces}
          hiddenWorkspaceIds={client.hiddenWorkspaceIds}
          onSaved={refresh}
        />
      </Section>

      <Section title="Authorizations">
        <ClientGrants clientId={client.clientId} label={client.label} onChanged={refresh} />
      </Section>
    </div>
  );
}
