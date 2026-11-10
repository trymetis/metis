"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import { MetisMark } from "@metis/ui/components/metis-mark";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signIn } from "@/auth/client";
import { AuthInput } from "@/components/auth-input";
import { Field } from "@/components/field";
import { orpc } from "@/lib/orpc";
import { type InvitePreview, inviteSignupInputSchema } from "@/server/schema";

import { inviteDetail, inviteHeading } from "./invite-copy";

type LegalLinks = {
  termsUrl: string | null;
  privacyUrl: string | null;
  version: string;
};

function LegalLabel({ legal }: { legal: LegalLinks }) {
  const terms = legal.termsUrl ? (
    <a
      href={legal.termsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-neutral-600 dark:text-neutral-300 underline-offset-4 hover:underline"
    >
      Terms of Service
    </a>
  ) : null;
  const privacy = legal.privacyUrl ? (
    <a
      href={legal.privacyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-neutral-600 dark:text-neutral-300 underline-offset-4 hover:underline"
    >
      Privacy Policy
    </a>
  ) : null;
  return (
    <>
      I agree to the {terms}
      {terms && privacy ? " and " : null}
      {privacy}.
    </>
  );
}

export function InviteSignupInner({
  token,
  invitedEmail,
  preview,
  legal,
}: {
  token: string;
  invitedEmail: string;
  preview: InvitePreview;
  legal: LegalLinks | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = inviteSignupInputSchema.safeParse({
      token,
      name,
      password,
    });
    if (!parsed.success) {
      return setError(parsed.error.issues[0]?.message ?? "Check the form and try again");
    }
    if (legal && !agreed) return setError("Agree to the terms to create your account");

    setSubmitting(true);
    try {
      const created = await orpc.signup.invite(parsed.data);

      const result = await signIn.email({
        email: created.email,
        password: parsed.data.password,
      });
      if (result?.error) {
        setError("Account created, but sign-in failed. Try signing in from the home page.");
        return;
      }
      router.replace("/2fa/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <MetisMark className="mx-auto mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            {inviteHeading(preview)}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {inviteDetail(preview)} Pick a password to create your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Email address">
            <AuthInput type="email" value={invitedEmail} readOnly disabled className="font-mono" />
          </Field>

          <Field label="Name">
            <AuthInput
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              autoFocus
              disabled={submitting}
            />
          </Field>

          <Field label="Password">
            <AuthInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={submitting}
            />
          </Field>

          {legal && (
            <label className="mt-1 flex cursor-pointer items-start gap-2.5 text-left text-xs text-neutral-500">
              <Checkbox
                checked={agreed}
                onCheckedChange={(value) => setAgreed(value)}
                disabled={submitting}
                className="mt-0.5"
              />
              <span>
                <LegalLabel legal={legal} />
              </span>
            </label>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <Button
            type="submit"
            disabled={submitting || (!!legal && !agreed)}
            className="mt-1 h-auto w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900 hover:opacity-90 dark:bg-white dark:text-neutral-900 dark:hover:bg-white"
          >
            {submitting ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-neutral-900/40 dark:border-t-neutral-900" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </div>
    </main>
  );
}
