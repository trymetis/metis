"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { inferAdditionalFields, jwtClient, magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { rateLimitMessage } from "@/lib/rate-limit-message";

import type { Auth } from "./server";
import { twoFactorClient } from "./two-factor/client";

function withWaitTime(response: Response): Response | undefined {
  if (response.status !== 429) return;
  const wait = Number(response.headers.get("X-Retry-After"));
  if (!Number.isFinite(wait) || wait <= 0) return;
  return Response.json({ message: rateLimitMessage(wait) }, { status: 429 });
}

export const authClient = createAuthClient({
  fetchOptions: {
    onResponse: ({ response }) => withWaitTime(response),
  },
  plugins: [
    inferAdditionalFields<Auth>(),
    oauthProviderClient(),
    magicLinkClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        window.location.href = "/2fa/verify";
      },
    }),
    jwtClient(),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
