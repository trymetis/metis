import { NextResponse } from "next/server";

import { NATIVE_TICKET_PARAM } from "@/auth/native";
import { consumeNativeConnectTicket } from "@/auth/native-ticket";
import { getAppUser } from "@/auth/session";
import { sanitizeCallbackPath } from "@/auth/two-factor-callback";
import { config } from "@/config";
import {
  type ConnectionResource,
  getConnection,
  getDriver,
  getOAuthDriver,
  isConnectionProvider,
  isConnectionResource,
  isProviderConfigured,
  listUserConnectionsByProvider,
} from "@/connections";
import {
  connectionsCallbackUrl,
  connectionsErrorUrl,
  encodeOAuthState,
  nonceCookieName,
  STATE_TTL_SEC,
} from "@/connections/oauth-state";
import { getWorkspaceBySlug } from "@/workspace";

const SETTINGS_PATH: Record<ConnectionResource, string> = {
  mailbox: "/settings/mailboxes",
  calendar: "/settings/calendars",
  drive: "/settings/drives",
  addressbook: "/settings/address-books",
};

const RESOURCE_LABEL: Record<ConnectionResource, string> = {
  mailbox: "mail",
  calendar: "calendars",
  drive: "files",
  addressbook: "contacts",
};

function redirectError(message: string) {
  return NextResponse.redirect(connectionsErrorUrl(message));
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/connections/start/[provider]/[resource]">,
) {
  const { provider, resource } = await params;

  if (!isConnectionProvider(provider)) {
    return redirectError(`Unknown provider: ${provider}`);
  }
  if (!isConnectionResource(resource)) {
    return redirectError(`Unknown resource: ${resource}`);
  }
  if (!isProviderConfigured(provider)) {
    return redirectError(`${getDriver(provider).label} is not configured on this server`);
  }
  if (getDriver(provider).kind !== "oauth") {
    return redirectError(
      `${getDriver(provider).label} accounts are connected with a username and password, not OAuth`,
    );
  }
  if (!getDriver(provider).resources.includes(resource)) {
    return redirectError(
      `${getDriver(provider).label} accounts cannot be connected for ${RESOURCE_LABEL[resource]}`,
    );
  }

  const { searchParams, pathname } = new URL(request.url);

  const nativeTicket = searchParams.get(NATIVE_TICKET_PARAM);
  const nativeUserId = nativeTicket
    ? await consumeNativeConnectTicket(nativeTicket, pathname)
    : null;
  if (nativeTicket && !nativeUserId) {
    return redirectError("This link from the Metis app has expired. Start again from the app.");
  }

  const userId = nativeUserId ?? (await getAppUser(request.headers))?.userId ?? null;
  if (!userId) {
    return NextResponse.redirect(`${config.auth.url}/?error=sign-in-required`);
  }

  const callbackURL =
    sanitizeCallbackPath(searchParams.get("callbackURL")) ?? SETTINGS_PATH[resource];

  const attachWorkspaceSlug = searchParams.get("attachTo") ?? undefined;
  const attachWorkspace = attachWorkspaceSlug
    ? await getWorkspaceBySlug(userId, attachWorkspaceSlug)
    : null;
  if (attachWorkspaceSlug && !attachWorkspace) {
    return redirectError("Unknown workspace");
  }

  const expectConnection = searchParams.get("expectConnection");
  const expected = expectConnection ? await getConnection(expectConnection, userId) : null;
  if (expectConnection && !expected) {
    return redirectError("Unknown account");
  }
  if (expected && expected.provider !== provider) {
    return redirectError("Account does not belong to this provider");
  }

  const driver = getOAuthDriver(provider);

  const resources = new Set<ConnectionResource>([resource]);
  if (!driver.mergesGrantedScopes) {
    const existing = await listUserConnectionsByProvider(userId, provider);
    for (const row of existing) {
      for (const granted of driver.grantedResources(row.scope)) {
        resources.add(granted);
      }
    }
  }

  const requested = [...resources];

  const { state, nonce } = encodeOAuthState({
    provider,
    resource,
    resources: requested,
    callbackURL,
    attachWorkspaceSlug,
    attachPreselect: request.headers.get("sec-fetch-site") === "same-origin",
    expect: expected ? { accountId: expected.providerAccountId, email: expected.email } : undefined,
    nativeUserId: nativeUserId ?? undefined,
  });

  const redirectUri = connectionsCallbackUrl(provider);
  const response = NextResponse.redirect(
    driver.buildAuthUrl({
      state,
      redirectUri,
      resources: requested,
      loginHint: expected?.email,
    }),
  );

  response.cookies.set(nonceCookieName(nonce), nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.auth.secureCookies,
    path: "/",
    maxAge: STATE_TTL_SEC,
  });
  return response;
}
