import { z } from "zod";

import type { OAuthProfile, TokenSet } from "../types";
import { createOAuthDriver } from "./oauth";

const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";

async function fetchPhotoDataUrl(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/photos/96x96/$value", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const microsoftProfileSchema = z.object({
  id: z.string().optional(),
  mail: z.string().nullish(),
  userPrincipalName: z.string().optional(),
  displayName: z.string().nullish(),
});

async function getProfile(token: TokenSet): Promise<OAuthProfile> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Microsoft profile fetch failed (${res.status})`);
  }
  const data = microsoftProfileSchema.parse(await res.json());
  const email = data.mail ?? data.userPrincipalName;
  if (!email) throw new Error("Microsoft profile missing email");
  return {
    providerAccountId: data.id ?? email,
    email,
    name: data.displayName ?? undefined,
    image: await fetchPhotoDataUrl(token.accessToken),
  };
}

export const microsoftDriver = createOAuthDriver({
  provider: "microsoft",
  label: "Outlook",
  mergesGrantedScopes: true,
  scopes: {
    base: ["openid", "email", "profile", "User.Read", "offline_access"],
    byResource: {
      mailbox: ["Mail.ReadWrite", "Mail.Send"],
      calendar: ["Calendars.ReadWrite"],
      drive: ["Files.ReadWrite"],
      addressbook: ["Contacts.ReadWrite"],
    },
    markers: {
      mailbox: "mail.readwrite",
      calendar: "calendars.readwrite",
      drive: "files.readwrite",
      addressbook: "contacts.readwrite",
    },
  },
  authorizeUrl: `${AUTH_BASE}/authorize`,
  tokenEndpoint: `${AUTH_BASE}/token`,
  authorizeParams: ({ loginHint }) => ({
    response_mode: "query",
    ...(loginHint ? { login_hint: loginHint } : { prompt: "select_account" }),
  }),
  sendScopeOnExchange: true,
  getProfile,
});
