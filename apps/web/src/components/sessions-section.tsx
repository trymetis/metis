"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@metis/ui/components/alert-dialog";
import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Monitor } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { clearLocalData } from "@/auth/local-data";
import { describeUserAgent } from "@/auth/user-agent";
import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";
import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { formatRelativeDate } from "@/lib/utils";

type SessionRow = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  updatedAt: Date | string;
  expiresAt: Date | string;
  isCurrent: boolean;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function SessionsSection() {
  const sessionsOptions = rpc.user.listSessions.queryOptions();
  const query = useQuery(sessionsOptions);
  const sessions: SessionRow[] | null = query.data ?? (query.isError ? [] : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const error =
    actionError ?? (query.error ? query.error.message || "Could not load your sessions" : null);
  const [includeCurrent, setIncludeCurrent] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const code = useTwoFactorCode();

  async function load() {
    await refreshQuery(sessionsOptions.queryKey);
  }

  async function revokeOne(sessionId: string) {
    setBusy(sessionId);
    setError(null);
    try {
      await orpc.user.revokeSession({ sessionId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke that session");
    }
    setBusy(null);
  }

  async function revokeBulk() {
    setBusy("bulk");
    setError(null);
    const opts = { headers: { "x-totp-code": code.value } };
    const { error: err } = includeCurrent
      ? await authClient.revokeSessions({}, opts)
      : await authClient.revokeOtherSessions({}, opts);

    if (err) {
      setError(err.message ?? "Could not revoke your sessions");
      setBusy(null);
      return;
    }

    setRevokeOpen(false);
    code.reset();
    if (includeCurrent) {
      await clearLocalData();
      window.location.href = "/";
      return;
    }
    await load();
    setBusy(null);
  }

  const others = (sessions ?? []).filter((s) => !s.isCurrent);
  const ordered = (sessions ?? []).toSorted((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return +new Date(toIso(b.updatedAt)) - +new Date(toIso(a.updatedAt));
  });

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-medium text-foreground">Where you&rsquo;re signed in</h2>
          <p className="mt-1 text-[13px] text-faint">
            Every browser currently signed into this account.
          </p>
        </div>

        {others.length > 0 && (
          <AlertDialog
            open={revokeOpen}
            onOpenChange={(open) => {
              setRevokeOpen(open);
              if (!open) {
                setIncludeCurrent(false);
                code.reset();
              }
            }}
          >
            <AlertDialogTrigger
              render={
                <Button variant="outline" className="shrink-0">
                  Sign out all
                </Button>
              }
            />
            <AlertDialogContent size="lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out other browsers?</AlertDialogTitle>
                <AlertDialogDescription>
                  {others.length} other {others.length === 1 ? "session" : "sessions"} will end
                  immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-panel px-3 py-2.5">
                <Checkbox
                  checked={includeCurrent}
                  onCheckedChange={(v) => setIncludeCurrent(v)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">
                    Also sign out this device
                  </span>
                  <span className="mt-0.5 block text-[12px] text-faint">
                    You will be signed out here too and sent back to the sign-in page.
                  </span>
                </span>
              </label>

              <TwoFactorInput autoFocus field={code.field} />
              {error && busy === "bulk" && (
                <p className="text-center text-xs text-destructive-text">{error}</p>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={busy !== null || !code.complete}
                  onClick={revokeBulk}
                >
                  {busy === "bulk" && <Loader2 className="size-4 animate-spin" />}
                  {includeCurrent ? "Sign out everywhere" : "Sign out others"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive-text">
          {error}
        </div>
      )}

      {sessions === null ? (
        <p className="mt-4 text-[13px] text-faint">Loading…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {ordered.map((session) => {
            const isCurrent = session.isCurrent;
            return (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel">
                  <Monitor className="size-4 text-faint" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {describeUserAgent(session.userAgent ?? null)}
                    </p>
                    {isCurrent && <Badge variant="secondary">This device</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-faint">
                    {session.ipAddress || "IP unknown"} · active{" "}
                    {formatRelativeDate(toIso(session.updatedAt))} · expires{" "}
                    {formatRelativeDate(toIso(session.expiresAt))}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isCurrent || busy !== null}
                  onClick={() => revokeOne(session.id)}
                  className="shrink-0 text-destructive-text"
                >
                  {busy === session.id ? <Loader2 className="size-4 animate-spin" /> : "Sign out"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
