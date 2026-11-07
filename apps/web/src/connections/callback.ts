import "server-only";
import { cookies } from "next/headers";

import { nativeOpenLink, nativeReturnPath } from "@/auth/native-link";
import { getAppUser } from "@/auth/session";

import { decodeOAuthState, nonceCookieName, type OAuthState } from "./oauth-state";
import { getDriver, isConnectionProvider } from "./registry";
import type { ConnectionProvider } from "./types";

export type ConnectRequest =
  | {
      ok: true;
      provider: ConnectionProvider;
      state: OAuthState;
      userId: string;
      code: string;
      native: boolean;
    }
  | { ok: false; error: string; returnTo: string | null };

const PROVIDER_ERROR_MAX = 100;

export function connectReturnPath(path: string, native: boolean): string {
  return native ? nativeReturnPath(nativeOpenLink(path)) : path;
}

export async function readConnectRequest(
  rawProvider: string,
  query: URLSearchParams,
  headers: Headers,
): Promise<ConnectRequest> {
  if (!isConnectionProvider(rawProvider)) {
    return { ok: false, error: `Unknown provider: ${rawProvider}`, returnTo: null };
  }
  const provider = rawProvider;
  const driver = getDriver(provider);

  const state = decodeOAuthState(query.get("state"), provider);
  if (!state) {
    return {
      ok: false,
      error: "This connection request is no longer valid. Connect the account again.",
      returnTo: null,
    };
  }
  const native = Boolean(state.nativeUserId);
  const fail = (error: string): ConnectRequest => ({
    ok: false,
    error,
    returnTo: connectReturnPath(state.callbackURL, native),
  });

  const issued = (await cookies()).get(nonceCookieName(state.nonce))?.value;
  if (issued !== state.nonce) {
    return fail(
      "This connection was started in another browser, or it already finished. Connect the account again.",
    );
  }

  const userId = state.nativeUserId ?? (await getAppUser(headers))?.userId;
  if (!userId) {
    return fail(
      "Sign in with the account that started this connection, then connect the account again.",
    );
  }

  const providerError = query.get("error");
  if (providerError) {
    return fail(
      `${driver.label} did not grant access (${providerError.slice(0, PROVIDER_ERROR_MAX)}). Nothing was connected.`,
    );
  }

  const code = query.get("code");
  if (!code) return fail(`${driver.label} sent no authorization code. Connect the account again.`);
  if (driver.kind !== "oauth") {
    return fail(`${driver.label} accounts do not use an OAuth callback`);
  }

  return { ok: true, provider, state, userId, code, native };
}
