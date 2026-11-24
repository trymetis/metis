"use client";

import { Button } from "@metis/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { signOut } from "@/auth/client";
import { clearLocalData } from "@/auth/local-data";
import { nativeAuthLink, nativeReturnPath } from "@/auth/native-link";
import { NativeCard } from "@/components/native-card";
import { rateLimitMessage } from "@/lib/rate-limit-message";
import { route } from "@/lib/route";

const codeResponseSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export function NativeLoginConfirm({
  email,
  challenge,
  state,
}: {
  email: string;
  challenge: string;
  state: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/native/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge }),
      });
      const body = codeResponseSchema.safeParse(await res.json().catch(() => null)).data;
      const wait = res.status === 429 ? Number(res.headers.get("X-Retry-After")) : NaN;
      if (Number.isFinite(wait) && wait > 0) {
        setError(rateLimitMessage(wait));
        return;
      }
      if (!res.ok || !body?.code) {
        setError(body?.message ?? "Could not sign in to the Metis app");
        return;
      }
      router.replace(route(nativeReturnPath(nativeAuthLink(body.code, state))));
    } catch {
      setError("Could not sign in to the Metis app");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwitchAccount() {
    setSubmitting(true);
    await clearLocalData();
    await signOut();
    window.location.reload();
  }

  return (
    <NativeCard
      title="Sign in to the Metis app"
      body={
        <>
          You are signed in as{" "}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">{email}</span>. Only
          continue if you started this from the Metis app.
        </>
      }
    >
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <Button
        className="h-auto w-full rounded-xl px-4 py-3"
        disabled={submitting}
        onClick={handleConfirm}
      >
        {submitting ? "Signing in…" : `Continue as ${email}`}
      </Button>
      <Button
        variant="ghost"
        className="h-auto w-full rounded-xl px-4 py-3"
        disabled={submitting}
        onClick={handleSwitchAccount}
      >
        Use a different account
      </Button>
    </NativeCard>
  );
}
