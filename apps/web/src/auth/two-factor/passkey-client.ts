"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import { useSyncExternalStore } from "react";

import { authClient } from "@/auth/client";
import { isRecord } from "@/lib/guards";

function passkeysSupported(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

function subscribeToNothing() {
  return () => {};
}

export function usePasskeySupport(): boolean {
  return useSyncExternalStore(subscribeToNothing, passkeysSupported, () => false);
}

export class PasskeyCeremonyError extends Error {}

function ceremonyError(error: unknown, fallback: string): Error {
  if (error instanceof WebAuthnError) {
    if (error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
      return new PasskeyCeremonyError("This passkey is already on your account.");
    }
    if (error.code === "ERROR_CEREMONY_ABORTED") {
      return new PasskeyCeremonyError("The passkey request was cancelled.");
    }
  }
  if (error instanceof Error && error.name === "NotAllowedError") {
    return new PasskeyCeremonyError("The passkey request was cancelled or timed out.");
  }
  return new PasskeyCeremonyError(
    error instanceof Error && error.message ? error.message : fallback,
  );
}

function failure(error: { message?: string } | null | undefined, fallback: string): Error {
  return new Error(error?.message || fallback);
}

type RegistrationOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];

export interface PasskeyEnrollment {
  options: RegistrationOptions;
  backupCodes: string[] | null;
  startedAt: number;
}

export const PASSKEY_ENROLLMENT_MAX_AGE_MS = 4 * 60 * 1000;

export async function startPasskeyEnrollment(
  confirmation: { code: string } | { password: string },
): Promise<PasskeyEnrollment> {
  const started = await authClient.twoFactor.enroll({ method: "passkey", ...confirmation });
  if (started.error || !started.data?.options) {
    throw failure(started.error, "Couldn't start adding a passkey");
  }
  return {
    options: started.data.options,
    backupCodes: started.data.backupCodes,
    startedAt: Date.now(),
  };
}

export async function finishPasskeyEnrollment(enrollment: PasskeyEnrollment, name: string) {
  let response: Awaited<ReturnType<typeof startRegistration>>;
  try {
    response = await startRegistration({ optionsJSON: enrollment.options });
  } catch (error) {
    throw ceremonyError(error, "Couldn't create the passkey");
  }
  const saved = await authClient.twoFactor.enroll.confirm({
    method: "passkey",
    response,
    name: name.trim() || undefined,
  });
  if (saved.error || !saved.data) throw failure(saved.error, "Couldn't save the passkey");
  return saved.data.passkey;
}

export async function addPasskey(input: { name: string; code: string }) {
  return finishPasskeyEnrollment(await startPasskeyEnrollment({ code: input.code }), input.name);
}

async function passkeyAssertion() {
  const options = await authClient.twoFactor.challenge({ method: "passkey" });
  if (options.error || !options.data) {
    throw failure(options.error, "Couldn't start the passkey check");
  }
  try {
    return await startAuthentication({ optionsJSON: options.data });
  } catch (error) {
    throw ceremonyError(error, "Couldn't use the passkey");
  }
}

export async function confirmWithPasskey(): Promise<string> {
  const response = await passkeyAssertion();
  const result = await authClient.twoFactor.verify({ method: "passkey", response });
  if (result.error) throw failure(result.error, "Passkey verification failed");
  const data: unknown = result.data;
  if (!isRecord(data) || typeof data.proof !== "string") {
    throw new Error("Passkey verification failed");
  }
  return data.proof;
}

export async function signInWithPasskey(trustDevice: boolean): Promise<void> {
  const response = await passkeyAssertion();
  const result = await authClient.twoFactor.verify({ method: "passkey", response, trustDevice });
  if (result.error) throw failure(result.error, "Passkey verification failed");
}
