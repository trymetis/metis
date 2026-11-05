"use client";

import { Button } from "@metis/ui/components/button";
import { skipToken, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Building2,
  Check,
  Globe,
  Loader2,
  type LucideIcon,
  RefreshCw,
  UserRound,
  Wrench,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { authClient } from "@/auth/client";
import { McpPresetIcon } from "@/components/mcp-preset-icon";
import { McpToolPicker } from "@/components/mcp-tool-picker";
import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { orpc, rpc } from "@/lib/orpc";
import { recordOf } from "@/lib/records";
import { MCP_PRESETS } from "@/mcp/presets";
import { isMcpToolEnabled, MCP_TOOL_KEYS, type McpToolKey, mcpToolsFor } from "@/mcp/tools";
import type { McpAccess, PublicMcpClient } from "@/server/schema";

import { WorkspaceSelect } from "./workspace-select";

type ScopeCopy = { icon: LucideIcon; title: string; detail: string };

const IDENTITY: ScopeCopy = {
  icon: UserRound,
  title: "See your name and email address",
  detail: "So it can show which account it is connected to",
};

const SCOPE_COPY = {
  openid: null,
  profile: IDENTITY,
  email: IDENTITY,
  offline_access: {
    icon: RefreshCw,
    title: "Stay connected",
    detail: "So you won't need to approve this again each time you sign in",
  },
} satisfies Record<string, ScopeCopy | null>;

function isOAuthScope(scope: string): scope is keyof typeof SCOPE_COPY {
  return Object.hasOwn(SCOPE_COPY, scope);
}

function scopeLines(scopes: readonly string[]): ScopeCopy[] {
  const lines = new Set<ScopeCopy>();
  for (const scope of scopes) {
    if (!isOAuthScope(scope)) continue;
    const copy = SCOPE_COPY[scope];
    if (copy) lines.add(copy);
  }
  return [...lines];
}

function Spinner() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface">
      <Loader2 className="size-6 animate-spin text-faint" />
    </main>
  );
}

const WITHHELD = [
  "Your password, or any way to sign in as you",
  "Workspaces you hide from it, and any workspace with AI turned off",
  "Mailboxes, calendars and drives that have AI turned off",
  "Permission to change your AI settings or this app's own access",
];

const consentResultSchema = z.object({ redirectURI: z.string() });

function defaultTools(): Record<McpToolKey, boolean> {
  return recordOf(MCP_TOOL_KEYS, (key) => isMcpToolEnabled(undefined, key));
}

export function ConsentInner() {
  const params = useSearchParams();
  const clientId = params.get("client_id");
  const scopes = (params.get("scope") ?? "").split(" ").filter(Boolean);

  const clientQuery = useQuery(
    rpc.mcp.publicClient.queryOptions({ input: clientId ? { clientId } : skipToken }),
  );
  const accessQuery = useQuery(rpc.mcp.access.queryOptions({ enabled: Boolean(clientId) }));
  const client: PublicMcpClient | null = clientQuery.data ?? null;
  const access: McpAccess | null = accessQuery.data ?? null;
  const failed = clientQuery.error ?? accessQuery.error;
  const loadError = failed ? failed.message || "Something went wrong" : null;
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [tools, setTools] = useState(defaultTools);
  const [submitting, setSubmitting] = useState<"accept" | "deny" | null>(null);
  const code = useTwoFactorCode();
  const [error, setError] = useState<string | null>(null);

  const isNew = client?.status === "new";
  const manifest = mcpToolsFor({ isOwner: access?.isOwner ?? false });
  const enabledTools = manifest.filter((t) => tools[t.key]);
  const workspaces = access?.workspaces ?? [];
  const hiddenIds = client?.status === "connected" ? new Set(client.hiddenWorkspaceIds) : hidden;
  const reachable = workspaces.filter((w) => w.aiAvailable && !hiddenIds.has(w.id));

  async function respond(accept: boolean) {
    setSubmitting(accept ? "accept" : "deny");
    setError(null);
    try {
      if (accept && isNew && clientId) {
        await orpc.mcp.registerConsentClient({
          clientId,
          hiddenWorkspaceIds: [...hidden],
          tools,
          code: code.value,
        });
      }

      const { data, error: err } = await authClient.oauth2.consent(
        { accept },
        accept ? { headers: { "x-totp-code": code.value } } : undefined,
      );
      const redirectURI = consentResultSchema.safeParse(data).data?.redirectURI;
      if (err || !redirectURI) {
        setError(err?.message ?? "Could not complete the request");
        setSubmitting(null);
        return;
      }
      window.location.href = redirectURI;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(null);
    }
  }

  if (!clientId) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-serif text-[22px] font-medium tracking-tight text-foreground">
            Nothing to authorize
          </h1>
          <p className="mt-2 text-[13px] text-faint">
            This link is missing the information needed to continue. Go back to the app you were
            connecting and start again.
          </p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card px-6 py-6 text-center">
          <h1 className="font-serif text-[22px] font-medium tracking-tight text-foreground">
            This request could not be loaded
          </h1>
          <p className="mt-2 text-[13px] text-destructive-text">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-5 w-full"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!client || !access) return <Spinner />;

  if (client.status === "unknown") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card px-6 py-6 text-center">
          <Bot className="mx-auto size-6 text-faint" />
          <h1 className="mt-3 font-serif text-[22px] font-medium tracking-tight text-foreground">
            This app can&rsquo;t connect here
          </h1>
          <p className="mt-2 text-[13px] text-faint">
            It isn&rsquo;t registered with this server. Go back to the app you were connecting and
            start again.
          </p>
          {error && <p className="mt-3 text-[13px] text-destructive-text">{error}</p>}
          <Button
            type="button"
            variant="outline"
            className="mt-5 w-full"
            disabled={submitting !== null}
            onClick={() => respond(false)}
          >
            {submitting === "deny" && <Loader2 className="size-4 animate-spin" />}
            Go back to the app
          </Button>
        </div>
      </main>
    );
  }

  const connected = client.status === "connected" ? client : null;
  const preset = connected?.preset ? MCP_PRESETS[connected.preset] : undefined;
  const name = client.label;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[minmax(0,1fr)_320px]">
        <aside className="order-1 border-b border-border bg-panel/40 px-6 py-6 md:order-2 md:border-b-0 md:border-l">
          <span className="flex size-12 items-center justify-center rounded-xl bg-panel p-2.5">
            {connected ? (
              <McpPresetIcon preset={connected.preset} />
            ) : (
              <Bot className="size-5 text-faint" />
            )}
          </span>
          <h1 className="mt-4 font-serif text-[20px] font-medium leading-tight tracking-tight text-foreground">
            {name}
          </h1>
          <p className="mt-1 text-[13px] text-faint">
            wants access to your mail, calendars and drives
          </p>

          {preset && <p className="mt-3 text-[12px] text-faint">{preset.label}</p>}

          {client.status === "new" && (
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <p className="text-[12px] text-faint">
                This app identified itself. Check these match the app you are connecting:
              </p>
              <div className="flex gap-2">
                <Globe className="mt-0.5 size-3.5 shrink-0 text-faint" />
                <span className="min-w-0 break-all font-mono text-[12px] text-foreground">
                  {client.clientIdUrl}
                </span>
              </div>
              {client.redirectHosts.length > 0 && (
                <div className="flex gap-2">
                  <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-faint" />
                  <span className="min-w-0 break-all font-mono text-[12px] text-foreground">
                    returns to {client.redirectHosts.join(", ")}
                  </span>
                </div>
              )}
            </div>
          )}

          <section className="mt-5 border-t border-border pt-4">
            <h2 className="mb-2 text-[12px] font-medium text-faint">What it will never get</h2>
            <ul className="list-disc space-y-1.5 pl-4">
              {WITHHELD.map((item) => (
                <li key={item} className="text-[12px] text-faint">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div className="order-2 space-y-5 px-6 py-6 md:order-1">
          <section className="space-y-3">
            <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              It will be able to
            </h2>
            <ul className="space-y-3">
              {(connected || isNew) && (
                <li className="flex gap-3">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-faint" />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-tight text-foreground">
                      {reachable.length === 0
                        ? "Reach no workspace yet — none is turned on for it"
                        : `Reach mailboxes, calendars and drives with AI turned on in ${reachable.length} ${reachable.length === 1 ? "workspace" : "workspaces"}`}
                    </p>
                    {reachable.length > 0 && (
                      <p className="mt-0.5 text-[12px] text-faint">
                        {reachable.map((w) => w.name).join(" · ")}
                      </p>
                    )}
                    <p className="mt-0.5 text-[12px] text-faint">
                      Each call runs inside one workspace, under that workspace&rsquo;s own AI
                      settings. Workspaces you join later are included unless you hide them.
                    </p>
                  </div>
                </li>
              )}

              {connected && (
                <li className="flex gap-3">
                  <Wrench className="mt-0.5 size-4 shrink-0 text-faint" />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-tight text-foreground">
                      {connected.tools.length === 0
                        ? "Nothing — no tools are enabled for it"
                        : `Use ${connected.tools.length} ${connected.tools.length === 1 ? "tool" : "tools"} you enabled`}
                    </p>
                    {connected.tools.length > 0 && (
                      <p className="mt-0.5 text-[12px] text-faint">
                        {connected.tools.map((t) => t.label).join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              )}

              {scopeLines(scopes).map((line) => (
                <li key={line.title} className="flex gap-3">
                  <line.icon className="mt-0.5 size-4 shrink-0 text-faint" />
                  <div>
                    <p className="text-[13px] leading-tight text-foreground">{line.title}</p>
                    <p className="text-[12px] text-faint">{line.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {client.status === "new" && (
            <>
              <div>
                <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                  Workspaces ({reachable.length} of {workspaces.length})
                </span>
                <div className="mt-1">
                  <WorkspaceSelect
                    workspaces={workspaces}
                    selected={reachable.map((w) => w.id)}
                    onChange={(ids) => {
                      const keep = new Set(ids);
                      setHidden(
                        new Set(
                          workspaces
                            .filter((w) => w.aiAvailable && !keep.has(w.id))
                            .map((w) => w.id),
                        ),
                      );
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[12px] text-faint">
                  It reaches every workspace listed here, and any workspace you join later. You can
                  change this under Settings → MCP clients.
                </p>
              </div>

              <div>
                <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                  Tools ({enabledTools.length} of {manifest.length})
                </span>
                <div className="mt-1">
                  <McpToolPicker
                    tools={manifest}
                    value={tools}
                    onChange={(patch) => setTools((d) => ({ ...d, ...patch }))}
                  />
                </div>
                <p className="mt-1.5 text-[12px] text-faint">
                  You can change these later under Settings → MCP clients.
                </p>
              </div>
            </>
          )}

          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (submitting === null && code.complete) void respond(true);
            }}
          >
            <div>
              <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                Two-factor code
              </span>
              <TwoFactorInput field={code.field} align="start" className="mt-1" />
              <p className="mt-1.5 text-[12px] text-faint">
                Enter this code to confirm — access continues even after you sign out.
              </p>
            </div>

            {error && <p className="text-[13px] text-destructive-text">{error}</p>}

            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={submitting !== null}
                  onClick={() => respond(false)}
                >
                  {submitting === "deny" && <Loader2 className="size-4 animate-spin" />}
                  Deny
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={submitting !== null || !code.complete}
                >
                  {submitting === "accept" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Approve
                </Button>
              </div>
              <p className="text-center text-[12px] text-faint">
                Removing the app in settings revokes this immediately.
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
