"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc, rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { formatRelativeDate } from "@/lib/utils";

type Grant = {
  id: string;
  authorizedAt: Date;
  expiresAt: Date;
  scopes: string[];
};

export function ClientGrants({
  clientId,
  label,
  onChanged,
}: {
  clientId: string;
  label: string;
  onChanged: () => void;
}) {
  const grantsOptions = rpc.mcp.listGrants.queryOptions({ input: { clientId } });
  const query = useQuery(grantsOptions);
  const grants: Grant[] | null = query.data ?? null;
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? (query.error ? query.error.message || "Could not load" : null);

  async function revoke(grantId?: string) {
    setBusy(true);
    setError(null);
    try {
      await orpc.mcp.revokeGrants({ clientId, grantId });
      await refreshQuery(grantsOptions.queryKey);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-4">
      {grants && grants.length > 1 && (
        <div className="mb-3 flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" size="sm" disabled={busy}>
                  Revoke all
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke every authorization for {label}?</AlertDialogTitle>
                <AlertDialogDescription>
                  All {grants.length} authorizations stop working immediately, and the client must
                  ask for your approval again, which you confirm with your authenticator app, a
                  passkey or a backup code. The client itself stays connected, so you won&rsquo;t
                  need to reconfigure it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => revoke()}>Revoke all</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {error && <p className="mb-2 text-[13px] text-destructive-text">{error}</p>}

      {grants === null ? (
        <p className="text-[12px] text-faint">Loading…</p>
      ) : grants.length === 0 ? (
        <p className="text-[12px] text-faint">
          Not authorized. The client will ask for consent the next time it connects.
        </p>
      ) : (
        <ul className="space-y-2">
          {grants.map((grant) => (
            <li
              key={grant.id}
              className="flex items-center justify-between gap-4 rounded-lg bg-panel px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-[13px] text-foreground">
                  Authorized {formatRelativeDate(grant.authorizedAt.toISOString())}
                </p>
                <p className="mt-0.5 text-[12px] text-faint">
                  Expires {formatRelativeDate(grant.expiresAt.toISOString())}
                  {grant.scopes.includes("offline_access") && " · Can stay signed in without you"}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      className="shrink-0 text-destructive-text"
                    >
                      Revoke
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {label} loses this authorization and its access tokens immediately. Any other
                      authorizations it holds keep working.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => revoke(grant.id)}>Revoke</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
