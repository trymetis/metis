"use client";

import { Button } from "@metis/ui/components/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { orpc } from "@/lib/orpc";
import type { InvitePreview } from "@/server/schema";

import { Center } from "./center";
import { inviteDetail, inviteHeading } from "./invite-copy";

export function AcceptInner({ token, preview }: { token: string; preview: InvitePreview }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (preview.state === "signIn") {
    return (
      <Center>
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 text-center">
          <h2 className="text-sm font-semibold">{inviteHeading(preview)}</h2>
          <p className="mt-1.5 text-xs text-neutral-500">
            {inviteDetail(preview)} Sign in with the invited account to accept.
          </p>
          <Link
            href={`/?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`}
            className="mt-4 inline-block rounded-xl bg-neutral-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-neutral-900"
          >
            Sign in to accept
          </Link>
        </div>
      </Center>
    );
  }

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      const joined = await orpc.invites.accept({ token });
      setDone("accepted");
      router.replace(joined.workspaceSlug ? `/w/${joined.workspaceSlug}` : "/w");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the invite");
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      await orpc.invites.decline({ token });
      setDone("declined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline the invite");
    } finally {
      setBusy(null);
    }
  }

  if (done === "declined") {
    return (
      <Center>
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 text-center">
          <h2 className="text-sm font-semibold">Invite declined</h2>
          <p className="mt-1.5 text-xs text-neutral-500">Nothing was added to your account.</p>
          <Link
            href="/w"
            className="mt-4 inline-block text-xs text-neutral-500 underline-offset-4 hover:underline"
          >
            Back to inbox
          </Link>
        </div>
      </Center>
    );
  }

  return (
    <Center>
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 text-center">
        <h2 className="text-sm font-semibold">{inviteHeading(preview)}</h2>
        <p className="mt-1.5 text-xs text-neutral-500">{inviteDetail(preview)}</p>
        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || done !== null}
            onClick={decline}
          >
            Decline
          </Button>
          <Button size="sm" disabled={busy !== null || done !== null} onClick={accept}>
            {done === "accepted" ? "Joined" : "Accept"}
          </Button>
        </div>
      </div>
    </Center>
  );
}
