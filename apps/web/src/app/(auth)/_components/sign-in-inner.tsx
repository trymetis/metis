"use client";

import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import { MetisMark } from "@metis/ui/components/metis-mark";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient, signIn, signUp, useSession } from "@/auth/client";
import { rememberTwoFactorCallback } from "@/auth/two-factor-callback";
import { AuthInput } from "@/components/auth-input";
import { Field } from "@/components/field";
import { route } from "@/lib/route";
import { workspacePath, workspaceRootPath } from "@/workspace/path";

import { SuccessCard } from "./success-card";

function safeNextPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}

type Mode = "signin" | "signup";

type LegalLinks = {
  termsUrl: string | null;
  privacyUrl: string | null;
  version: string;
};

function LegalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-neutral-600 dark:text-neutral-300 underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

function LegalLabel({ legal }: { legal: LegalLinks }) {
  const terms = legal.termsUrl ? (
    <LegalLink href={legal.termsUrl}>Terms of Service</LegalLink>
  ) : null;
  const privacy = legal.privacyUrl ? (
    <LegalLink href={legal.privacyUrl}>Privacy Policy</LegalLink>
  ) : null;
  return (
    <>
      I agree to the {terms}
      {terms && privacy ? " and " : null}
      {privacy}.
    </>
  );
}

function consentRequiredMessage(legal: LegalLinks): string {
  if (legal.termsUrl && legal.privacyUrl) {
    return "Agree to the terms of service and privacy policy to create an account";
  }
  if (legal.privacyUrl) {
    return "Agree to the privacy policy to create an account";
  }
  return "Agree to the terms of service to create an account";
}

export function SignInInner({
  signupDisabled,
  legal,
}: {
  signupDisabled: boolean;
  legal: LegalLinks | null;
}) {
  const { data: session, isPending, isRefetching } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const [unverifiedSignIn, setUnverifiedSignIn] = useState(false);
  const [resendInfo, setResendInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (isPending || isRefetching || !session) return;
    const slug = session.user.defaultWorkspaceSlug;
    const target = nextPath ?? (slug ? workspacePath(slug) : workspaceRootPath());
    router.replace(route(target));
  }, [session, isPending, isRefetching, router, nextPath]);

  function resetTransient() {
    setError(null);
    setInfo(null);
    setResendInfo(null);
    setMagicSent(false);
    setVerifySent(false);
    setUnverifiedSignIn(false);
  }

  async function handleResendVerification() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed?.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    setResendInfo(null);
    try {
      const result = await authClient.sendVerificationEmail({
        email: trimmed,
        callbackURL: "/2fa/setup",
      });
      if (result?.error) {
        setError(result.error.message ?? "Could not send verification email");
        return;
      }
      const message = "Verification email sent. Check your inbox.";
      setResendInfo(message);
      if (!verifySent) setInfo(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send verification email");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignIn(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    resetTransient();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed?.includes("@")) return setError("Enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");

    setSubmitting(true);
    if (nextPath) rememberTwoFactorCallback(nextPath);
    try {
      const result = await signIn.email({
        email: trimmed,
        password,
        callbackURL: nextPath ?? workspaceRootPath(),
      });
      if (result?.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setUnverifiedSignIn(true);
          setError("Verify your email before signing in.");
          return;
        }
        setUnverifiedSignIn(false);
        setError(result.error.message ?? "Could not sign in");
        return;
      }
      setUnverifiedSignIn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUp(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    resetTransient();
    const trimmed = email.trim().toLowerCase();
    if (!name.trim()) return setError("Enter your name");
    if (!trimmed?.includes("@")) return setError("Enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (legal && !agreed) {
      return setError(consentRequiredMessage(legal));
    }

    setSubmitting(true);
    try {
      const result = await signUp.email(
        {
          name: name.trim(),
          email: trimmed,
          password,
          callbackURL: "/2fa/setup",
        },
        legal ? { headers: { "x-legal-consent": legal.version } } : undefined,
      );
      if (result?.error) {
        setError(result.error.message ?? "Could not create account");
        return;
      }
      setVerifySent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicLink() {
    resetTransient();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed?.includes("@")) return setError("Enter a valid email address");
    setSubmitting(true);
    try {
      const result = await signIn.magicLink({
        email: trimmed,
        callbackURL: nextPath ?? workspaceRootPath(),
      });
      if (result?.error) {
        setError(result.error.message ?? "Could not send sign-in link");
        return;
      }
      setMagicSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sign-in link");
    } finally {
      setSubmitting(false);
    }
  }

  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <MetisMark className="mx-auto mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Metis Suite
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            Sign in to manage your mail in one place
          </p>
        </div>

        {magicSent ? (
          <SuccessCard
            title="Check your email"
            body={
              <>
                We sent a sign-in link to{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{email}</span>.
                The link is valid for 15 minutes.
              </>
            }
            onReset={() => {
              setMagicSent(false);
              setEmail("");
            }}
          />
        ) : verifySent ? (
          <SuccessCard
            title="Verify your email"
            body={
              <>
                We sent a verification link to{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{email}</span>.
                Open it to finish creating your account and set up two-factor auth.
              </>
            }
            onResend={handleResendVerification}
            resendBusy={submitting}
            resendInfo={resendInfo}
            onReset={() => {
              setVerifySent(false);
              setMode("signin");
              setPassword("");
            }}
            resetLabel="Back to sign in"
          />
        ) : (
          <>
            {!signupDisabled && (
              <div className="mb-5 flex rounded-xl border border-neutral-200 dark:border-neutral-800 p-1 text-sm">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMode("signin");
                    resetTransient();
                  }}
                  className={`h-auto flex-1 rounded-lg px-3 py-2 font-medium ${
                    mode === "signin"
                      ? "bg-neutral-900 text-white hover:bg-neutral-900 hover:text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-white dark:hover:text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                >
                  Sign in
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMode("signup");
                    resetTransient();
                  }}
                  className={`h-auto flex-1 rounded-lg px-3 py-2 font-medium ${
                    mode === "signup"
                      ? "bg-neutral-900 text-white hover:bg-neutral-900 hover:text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-white dark:hover:text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                >
                  Create account
                </Button>
              </div>
            )}

            <form
              onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
              className="flex flex-col gap-3"
            >
              {mode === "signup" && (
                <Field label="Name">
                  <AuthInput
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    disabled={submitting}
                  />
                </Field>
              )}

              <Field label="Email address">
                <AuthInput
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus={mode === "signin"}
                  disabled={submitting}
                />
              </Field>

              <Field label="Password">
                <AuthInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signin" ? "Your password" : "At least 8 characters"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  disabled={submitting}
                />
              </Field>

              {legal && !signupDisabled && (
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
              {unverifiedSignIn && mode === "signin" && (
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-4 py-3 text-left">
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">
                    Didn&apos;t get the email? Check spam, or resend the verification link.
                  </p>
                  <Button
                    variant="link"
                    disabled={submitting}
                    onClick={handleResendVerification}
                    className="mt-2 h-auto p-0 text-xs font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-100"
                  >
                    {submitting ? "Sending…" : "Resend verification email"}
                  </Button>
                </div>
              )}
              {info && <p className="text-xs text-neutral-600 dark:text-neutral-300">{info}</p>}

              <Button
                type="submit"
                disabled={submitting || (mode === "signup" && !!legal && !agreed)}
                className="mt-1 h-auto w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-900 hover:opacity-90 dark:bg-white dark:text-neutral-900 dark:hover:bg-white"
              >
                {submitting ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-neutral-900/40 dark:border-t-neutral-900" />
                    {mode === "signin" ? "Signing in…" : "Creating account…"}
                  </>
                ) : mode === "signin" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Button>

              {mode === "signin" && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <Link
                    href="/forgot-password"
                    className="text-neutral-500 underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                  <Button
                    variant="link"
                    disabled={submitting}
                    onClick={handleMagicLink}
                    className="h-auto p-0 text-neutral-500 underline-offset-4 hover:underline"
                  >
                    Email me a magic link
                  </Button>
                </div>
              )}
            </form>

            {signupDisabled && (
              <p className="mt-4 text-center text-xs text-neutral-500">
                Accounts are by invitation only. Ask the instance owner or an admin to invite you.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
