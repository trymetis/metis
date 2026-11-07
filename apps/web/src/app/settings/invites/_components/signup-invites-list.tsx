"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { createSignupInviteInputSchema, type SignupInvite } from "@/server/schema";

function inviteStatus(invite: SignupInvite): string {
  if (invite.acceptedAt) return "accepted";
  if (new Date(invite.expiresAt).getTime() < Date.now()) return "expired";
  return "pending";
}

function refresh() {
  return refreshQuery(rpc.signupInvites.list.queryKey());
}

export function SignupInvitesList() {
  const query = useQuery(rpc.signupInvites.list.queryOptions());
  const invites = query.data?.invites ?? null;
  const loadError = query.error ? query.error.message || "Could not load your invites" : null;
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = createSignupInviteInputSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again");
      return;
    }

    setSending(true);
    try {
      const res = await orpc.signupInvites.create(parsed.data);
      setEmail("");
      await refresh();
      toast.success(`Invite sent to ${res.invite.email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite");
    } finally {
      setSending(false);
    }
  }

  async function revoke(inviteId: string) {
    setBusy(inviteId);
    try {
      await orpc.signupInvites.revoke({ inviteId });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke the invite");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Invites"
        description="Invite someone to create an account on this instance."
      />

      <section className="mt-8 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">Invite someone</h2>
        <form onSubmit={send} className="mt-3 flex items-center gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="them@example.com"
            autoComplete="off"
            disabled={sending}
            className="h-8 flex-1 text-[13px]"
          />
          <Button type="submit" size="sm" disabled={sending}>
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send invite
          </Button>
        </form>
        {error && <p className="mt-2 text-xs text-destructive-text">{error}</p>}

        {invites === null && loadError ? (
          <p className="mt-4 text-[13px] text-destructive-text">{loadError}</p>
        ) : invites === null ? (
          <p className="mt-4 text-[13px] text-faint">Loading invites…</p>
        ) : invites.length === 0 ? (
          <p className="mt-4 text-[13px] text-faint">No invites yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-1.5">
            {invites.map((invite) => {
              const status = inviteStatus(invite);
              const pending = status === "pending";
              return (
                <li
                  key={invite.id}
                  className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-xs"
                >
                  <span className="text-muted-foreground">
                    {invite.email} <span className="text-faint">· {status}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-faint">
                      {pending
                        ? `expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                        : new Date(invite.createdAt).toLocaleDateString()}
                    </span>
                    {pending && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy === invite.id}
                        onClick={() => revoke(invite.id)}
                        className="text-faint hover:bg-destructive/10 hover:text-destructive-text"
                        aria-label="Revoke invite"
                      >
                        {busy === invite.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
