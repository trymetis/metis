import { z } from "zod";

import type { OAuthProfile, TokenSet } from "../types";
import { createOAuthDriver, postForm } from "./oauth";

const googleProfileSchema = z.object({
  id: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

async function getProfile(token: TokenSet): Promise<OAuthProfile> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google profile fetch failed (${res.status})`);
  }
  const data = googleProfileSchema.parse(await res.json());
  if (!data.email) throw new Error("Google profile missing email");
  return {
    providerAccountId: data.id ?? data.email,
    email: data.email,
    name: data.name,
    image: data.picture ?? null,
  };
}

export const googleDriver = createOAuthDriver({
  provider: "google",
  label: "Gmail",
  mergesGrantedScopes: true,
  scopes: {
    base: ["openid", "email", "profile"],
    byResource: {
      mailbox: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      calendar: ["https://www.googleapis.com/auth/calendar"],
      drive: ["https://www.googleapis.com/auth/drive"],
      addressbook: ["https://www.googleapis.com/auth/contacts"],
    },
    markers: {
      mailbox: "/auth/gmail.",
      calendar: "/auth/calendar",
      drive: "/auth/drive",
      addressbook: "/auth/contacts",
    },
  },
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  authorizeParams: ({ loginHint }) => ({
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    ...(loginHint ? { login_hint: loginHint } : {}),
  }),
  getProfile,
  async revoke({ refreshToken, accessToken }) {
    const token = refreshToken ?? accessToken;
    if (!token) return;
    try {
      await postForm("https://oauth2.googleapis.com/revoke", { token });
    } catch {}
  },
});
